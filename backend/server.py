from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta, date


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Pricing constants (BRL)
PRICE_MENSALISTA = 60
PRICE_CONVIDADO = 20
PRICE_CHURRASCO = 20

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: Literal["mensalista", "convidado"]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PlayerCreate(BaseModel):
    name: str
    type: Literal["mensalista", "convidado"]


class Week(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    week_start: str
    label: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Attendance(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    week_id: str
    player_id: str
    attending: bool = False
    churrasco: bool = False
    paid: bool = False
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AttendanceUpsert(BaseModel):
    week_id: str
    player_id: str
    attending: Optional[bool] = None
    churrasco: Optional[bool] = None
    paid: Optional[bool] = None


class PixSettings(BaseModel):
    pix_key: str = ""
    holder_name: str = ""
    bank: str = ""


class TeamSettings(BaseModel):
    team_name: str = ""
    team_emoji: str = ""


# ---------- Helpers ----------
def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _week_label(monday: date) -> str:
    sunday = monday + timedelta(days=6)
    months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    return f"{monday.day:02d} {months[monday.month-1]} - {sunday.day:02d} {months[sunday.month-1]}"


async def _get_or_create_current_week() -> Week:
    today = datetime.now(timezone.utc).date()
    monday = _monday_of(today)
    key = monday.isoformat()
    existing = await db.weeks.find_one({"week_start": key}, {"_id": 0})
    if existing:
        return Week(**existing)
    w = Week(week_start=key, label=_week_label(monday))
    await db.weeks.insert_one(w.model_dump())
    return w


async def _summary_for_week(week_id: str) -> dict:
    attendances = await db.attendance.find({"week_id": week_id, "attending": True}, {"_id": 0}).to_list(1000)
    player_ids = [a["player_id"] for a in attendances]
    players = {}
    if player_ids:
        cursor = db.players.find({"id": {"$in": player_ids}}, {"_id": 0})
        async for p in cursor:
            players[p["id"]] = p

    total_mensalistas = 0
    total_convidados = 0
    total_churrasco = 0
    total_pago = 0
    count_mensalistas = 0
    count_convidados = 0
    count_churrasco = 0
    count_pagos = 0

    for a in attendances:
        p = players.get(a["player_id"])
        if not p:
            continue
        base = PRICE_MENSALISTA if p["type"] == "mensalista" else PRICE_CONVIDADO
        churras = PRICE_CHURRASCO if a.get("churrasco") else 0
        if p["type"] == "mensalista":
            total_mensalistas += PRICE_MENSALISTA
            count_mensalistas += 1
        else:
            total_convidados += PRICE_CONVIDADO
            count_convidados += 1
        if a.get("churrasco"):
            total_churrasco += PRICE_CHURRASCO
            count_churrasco += 1
        if a.get("paid"):
            total_pago += base + churras
            count_pagos += 1

    total_arrecadado = total_mensalistas + total_convidados + total_churrasco
    return {
        "total_mensalistas": total_mensalistas,
        "total_convidados": total_convidados,
        "total_churrasco": total_churrasco,
        "total_arrecadado": total_arrecadado,
        "total_pago": total_pago,
        "total_pendente": total_arrecadado - total_pago,
        "count_mensalistas": count_mensalistas,
        "count_convidados": count_convidados,
        "count_churrasco": count_churrasco,
        "count_pagos": count_pagos,
        "count_confirmados": count_mensalistas + count_convidados,
    }


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "FutLista API"}


# Players
@api_router.get("/players", response_model=List[Player])
async def list_players():
    docs = await db.players.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return [Player(**d) for d in docs]


@api_router.post("/players", response_model=Player)
async def create_player(inp: PlayerCreate):
    name = inp.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome obrigatório")
    p = Player(name=name, type=inp.type)
    await db.players.insert_one(p.model_dump())
    return p


@api_router.delete("/players/{player_id}")
async def delete_player(player_id: str):
    res = await db.players.delete_one({"id": player_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")
    await db.attendance.delete_many({"player_id": player_id})
    return {"ok": True}


# Weeks
@api_router.get("/weeks/current")
async def get_current_week():
    week = await _get_or_create_current_week()
    attendances = await db.attendance.find({"week_id": week.id}, {"_id": 0}).to_list(2000)
    summary = await _summary_for_week(week.id)
    return {"week": week.model_dump(), "attendance": attendances, "summary": summary}


@api_router.get("/weeks")
async def list_weeks():
    weeks_docs = await db.weeks.find({}, {"_id": 0}).sort("week_start", -1).to_list(500)
    if not weeks_docs:
        return []
    week_ids = [w["id"] for w in weeks_docs]
    all_att = await db.attendance.find(
        {"week_id": {"$in": week_ids}, "attending": True}, {"_id": 0}
    ).to_list(20000)
    player_ids = list({a["player_id"] for a in all_att})
    players_by_id: dict = {}
    if player_ids:
        cursor = db.players.find({"id": {"$in": player_ids}}, {"_id": 0})
        async for p in cursor:
            players_by_id[p["id"]] = p

    per_week: dict = {wid: [] for wid in week_ids}
    for a in all_att:
        if a["week_id"] in per_week:
            per_week[a["week_id"]].append(a)

    out = []
    for w in weeks_docs:
        atts = per_week.get(w["id"], [])
        tm = tc = tch = tp = cm = cc = cch = cp = 0
        for a in atts:
            p = players_by_id.get(a["player_id"])
            if not p:
                continue
            base = PRICE_MENSALISTA if p["type"] == "mensalista" else PRICE_CONVIDADO
            churras = PRICE_CHURRASCO if a.get("churrasco") else 0
            if p["type"] == "mensalista":
                tm += PRICE_MENSALISTA
                cm += 1
            else:
                tc += PRICE_CONVIDADO
                cc += 1
            if a.get("churrasco"):
                tch += PRICE_CHURRASCO
                cch += 1
            if a.get("paid"):
                tp += base + churras
                cp += 1
        total_arr = tm + tc + tch
        out.append({
            "week": w,
            "summary": {
                "total_mensalistas": tm,
                "total_convidados": tc,
                "total_churrasco": tch,
                "total_arrecadado": total_arr,
                "total_pago": tp,
                "total_pendente": total_arr - tp,
                "count_mensalistas": cm,
                "count_convidados": cc,
                "count_churrasco": cch,
                "count_pagos": cp,
                "count_confirmados": cm + cc,
            },
        })
    return out


@api_router.post("/weeks/new")
async def create_new_week():
    today = datetime.now(timezone.utc).date()
    monday = _monday_of(today)
    key_today = monday.isoformat()
    exists = await db.weeks.find_one({"week_start": key_today}, {"_id": 0})
    if exists:
        next_monday = monday + timedelta(days=7)
        key = next_monday.isoformat()
        already = await db.weeks.find_one({"week_start": key}, {"_id": 0})
        if already:
            return already
        w = Week(week_start=key, label=_week_label(next_monday))
        await db.weeks.insert_one(w.model_dump())
        return w.model_dump()
    w = Week(week_start=key_today, label=_week_label(monday))
    await db.weeks.insert_one(w.model_dump())
    return w.model_dump()


# Attendance
@api_router.put("/attendance")
async def upsert_attendance(inp: AttendanceUpsert):
    existing = await db.attendance.find_one({"week_id": inp.week_id, "player_id": inp.player_id}, {"_id": 0})
    if existing:
        update = {"updated_at": datetime.now(timezone.utc)}
        if inp.attending is not None:
            update["attending"] = inp.attending
            # if setting attending false, also clear churrasco and paid
            if inp.attending is False:
                update["churrasco"] = False
                update["paid"] = False
        if inp.churrasco is not None:
            update["churrasco"] = inp.churrasco
            if inp.churrasco and not existing.get("attending", False) and inp.attending is None:
                update["attending"] = True
        if inp.paid is not None:
            update["paid"] = inp.paid
        await db.attendance.update_one(
            {"week_id": inp.week_id, "player_id": inp.player_id},
            {"$set": update},
        )
        doc = await db.attendance.find_one({"week_id": inp.week_id, "player_id": inp.player_id}, {"_id": 0})
        return doc
    a = Attendance(
        week_id=inp.week_id,
        player_id=inp.player_id,
        attending=inp.attending if inp.attending is not None else False,
        churrasco=inp.churrasco if inp.churrasco is not None else False,
        paid=inp.paid if inp.paid is not None else False,
    )
    if a.churrasco and not a.attending:
        a.attending = True
    await db.attendance.insert_one(a.model_dump())
    return a.model_dump()


# Player history
@api_router.get("/players/{player_id}/history")
async def player_history(player_id: str):
    player = await db.players.find_one({"id": player_id}, {"_id": 0})
    if not player:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")
    weeks = await db.weeks.find({}, {"_id": 0}).sort("week_start", -1).to_list(500)
    atts = await db.attendance.find({"player_id": player_id}, {"_id": 0}).to_list(1000)
    by_week = {a["week_id"]: a for a in atts}
    result = []
    for w in weeks:
        a = by_week.get(w["id"])
        result.append({
            "week": w,
            "attending": bool(a and a.get("attending")),
            "churrasco": bool(a and a.get("churrasco")),
            "paid": bool(a and a.get("paid")),
        })
    total_present = sum(1 for r in result if r["attending"])
    total_churrasco = sum(1 for r in result if r["churrasco"])
    total_paid = sum(1 for r in result if r["paid"])
    return {
        "player": player,
        "history": result,
        "total_present": total_present,
        "total_churrasco": total_churrasco,
        "total_paid": total_paid,
    }


# Pix Settings
@api_router.get("/settings/pix")
async def get_pix_settings():
    doc = await db.settings.find_one({"id": "pix"}, {"_id": 0})
    if not doc:
        return {"pix_key": "", "holder_name": "", "bank": ""}
    return {
        "pix_key": doc.get("pix_key", ""),
        "holder_name": doc.get("holder_name", ""),
        "bank": doc.get("bank", ""),
    }


@api_router.put("/settings/pix")
async def update_pix_settings(inp: PixSettings):
    await db.settings.update_one(
        {"id": "pix"},
        {"$set": {
            "id": "pix",
            "pix_key": inp.pix_key.strip(),
            "holder_name": inp.holder_name.strip(),
            "bank": inp.bank.strip(),
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"pix_key": inp.pix_key, "holder_name": inp.holder_name, "bank": inp.bank}


# Team Settings
@api_router.get("/settings/team")
async def get_team_settings():
    doc = await db.settings.find_one({"id": "team"}, {"_id": 0})
    if not doc:
        return {"team_name": "", "team_emoji": ""}
    return {
        "team_name": doc.get("team_name", ""),
        "team_emoji": doc.get("team_emoji", ""),
    }


@api_router.put("/settings/team")
async def update_team_settings(inp: TeamSettings):
    await db.settings.update_one(
        {"id": "team"},
        {"$set": {
            "id": "team",
            "team_name": inp.team_name.strip(),
            "team_emoji": inp.team_emoji.strip(),
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"team_name": inp.team_name, "team_emoji": inp.team_emoji}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
