from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal, Annotated
import uuid
from datetime import datetime, timezone, timedelta, date
import secrets

import jwt as pyjwt
from passlib.context import CryptContext


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
JWT_EXPIRE_DAYS = int(os.environ.get('JWT_EXPIRE_DAYS', '30'))

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
DUMMY_HASH = pwd_ctx.hash("dummy-not-used")

# Pricing constants (BRL)
PRICE_MENSALISTA = 60
PRICE_CONVIDADO = 20
PRICE_CHURRASCO = 20

app = FastAPI()
api_router = APIRouter(prefix="/api")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ---------- Models ----------
class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: Literal["mensalista", "convidado"]
    monthly_fee: Optional[float] = None  # override; None = usa PRICE_MENSALISTA
    churrasco_fee: Optional[float] = None  # override; None = usa PRICE_CHURRASCO
    guest_fee: Optional[float] = None  # override para convidado; None = usa PRICE_CONVIDADO
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PlayerCreate(BaseModel):
    name: str
    type: Literal["mensalista", "convidado"]
    monthly_fee: Optional[float] = None
    churrasco_fee: Optional[float] = None
    guest_fee: Optional[float] = None


class PlayerUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[Literal["mensalista", "convidado"]] = None
    monthly_fee: Optional[float] = None
    churrasco_fee: Optional[float] = None
    guest_fee: Optional[float] = None
    clear_monthly_fee: Optional[bool] = None
    clear_churrasco_fee: Optional[bool] = None
    clear_guest_fee: Optional[bool] = None


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


class MonthlyPayment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    player_id: str
    month: str  # "YYYY-MM"
    paid: bool = False
    paid_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MonthlyPaymentUpsert(BaseModel):
    player_id: str
    month: str
    paid: bool


class Expense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: Literal["campo", "churrasco", "outros"]
    description: str
    amount: float
    date: str  # ISO date YYYY-MM-DD
    month: str  # YYYY-MM (derivado da date, indexado para query rápida)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExpenseCreate(BaseModel):
    category: Literal["campo", "churrasco", "outros"]
    description: str
    amount: float
    date: Optional[str] = None


class AdminCredentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str


class Invite(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    token: str = Field(default_factory=lambda: secrets.token_urlsafe(12))
    type: Literal["mensalista", "convidado"]
    created_by: str  # admin email or "player"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    uses: int = 0


class InviteCreate(BaseModel):
    type: Literal["mensalista", "convidado"]


class InviteAccept(BaseModel):
    name: str


# ---------- Helpers ----------
def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _week_label(monday: date) -> str:
    sunday = monday + timedelta(days=6)
    months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    return f"{monday.day:02d} {months[monday.month-1]} - {sunday.day:02d} {months[sunday.month-1]}"


def _current_month_key(d: Optional[date] = None) -> str:
    if d is None:
        d = datetime.now(timezone.utc).date()
    return f"{d.year:04d}-{d.month:02d}"


def _fifth_business_day(year: int, month: int) -> date:
    """Retorna o 5º dia útil do mês (segunda a sexta, sem feriados)."""
    d = date(year, month, 1)
    count = 0
    while True:
        if d.weekday() < 5:
            count += 1
            if count == 5:
                return d
        d = d + timedelta(days=1)


def _mensalista_blocked(today: date, paid_current_month: bool) -> bool:
    """Mensalista sem pagamento fica bloqueado a partir do 6º dia útil do mês."""
    if paid_current_month:
        return False
    deadline = _fifth_business_day(today.year, today.month)
    return today > deadline


def _price_monthly(p: dict) -> float:
    v = p.get("monthly_fee")
    return float(v) if v is not None else float(PRICE_MENSALISTA)


def _price_churrasco(p: dict) -> float:
    v = p.get("churrasco_fee")
    return float(v) if v is not None else float(PRICE_CHURRASCO)


def _price_guest(p: dict) -> float:
    v = p.get("guest_fee")
    return float(v) if v is not None else float(PRICE_CONVIDADO)


def _norm_email(email: str) -> str:
    return email.strip().lower()


def _create_token(email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "role": "admin",
        "iat": now,
        "exp": now + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_admin(token: Annotated[Optional[str], Depends(oauth2_scheme)]) -> dict:
    err = HTTPException(status_code=401, detail="Não autorizado")
    if not token:
        raise err
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise err
    except pyjwt.PyJWTError:
        raise err
    admin = await db.admins.find_one({"email": email}, {"_id": 0})
    if not admin:
        raise err
    return admin


async def get_optional_admin(token: Annotated[Optional[str], Depends(oauth2_scheme)]) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload.get("sub")
        if not email:
            return None
    except pyjwt.PyJWTError:
        return None
    return await db.admins.find_one({"email": email}, {"_id": 0})


AdminDep = Annotated[dict, Depends(get_current_admin)]


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

    # Mensalista blocking: se hoje > 5º dia útil e não pagou mês atual, bloqueado
    today = datetime.now(timezone.utc).date()
    month = _current_month_key(today)
    mensa_ids = [pid for pid, p in players.items() if p["type"] == "mensalista"]
    paid_map: dict = {}
    if mensa_ids:
        cursor = db.monthly_payments.find(
            {"player_id": {"$in": mensa_ids}, "month": month, "paid": True}, {"_id": 0}
        )
        async for mp in cursor:
            paid_map[mp["player_id"]] = True

    total_convidados = 0
    total_churrasco = 0
    total_pago = 0
    count_mensalistas = 0
    count_mensalistas_pendentes = 0
    count_convidados = 0
    count_convidados_pendentes = 0
    count_churrasco = 0
    count_pagos = 0

    for a in attendances:
        p = players.get(a["player_id"])
        if not p:
            continue
        is_paid = bool(a.get("paid"))
        churras_price = _price_churrasco(p)
        if p["type"] == "mensalista":
            paid_month = bool(paid_map.get(p["id"]))
            if _mensalista_blocked(today, paid_month):
                count_mensalistas_pendentes += 1
                continue
            count_mensalistas += 1
        else:
            if not is_paid:
                count_convidados_pendentes += 1
                continue
            total_convidados += _price_guest(p)
            count_convidados += 1
        # aqui só chega quem está oficialmente na lista
        if a.get("churrasco"):
            total_churrasco += churras_price
            count_churrasco += 1
        if is_paid:
            base_paid = _price_guest(p) if p["type"] == "convidado" else 0
            churras_paid = churras_price if a.get("churrasco") else 0
            total_pago += base_paid + churras_paid
            count_pagos += 1

    total_arrecadado = total_convidados + total_churrasco
    return {
        "total_mensalistas": 0,  # mensalidade é mensal, não entra no total semanal
        "total_convidados": total_convidados,
        "total_churrasco": total_churrasco,
        "total_arrecadado": total_arrecadado,
        "total_pago": total_pago,
        "total_pendente": total_arrecadado - total_pago,
        "count_mensalistas": count_mensalistas,
        "count_mensalistas_pendentes": count_mensalistas_pendentes,
        "count_convidados": count_convidados,
        "count_convidados_pendentes": count_convidados_pendentes,
        "count_churrasco": count_churrasco,
        "count_pagos": count_pagos,
        "count_confirmados": count_mensalistas + count_convidados,
    }


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "FutLista API"}


# ---------- Auth ----------
@api_router.get("/auth/setup-required")
async def auth_setup_required():
    count = await db.admins.count_documents({})
    return {"setup_required": count == 0}


@api_router.post("/auth/setup", response_model=Token)
async def auth_setup(inp: AdminCredentials):
    if await db.admins.count_documents({}) > 0:
        raise HTTPException(status_code=409, detail="Admin já cadastrado. Use /auth/login")
    email = _norm_email(inp.email)
    await db.admins.insert_one({
        "email": email,
        "password_hash": pwd_ctx.hash(inp.password),
        "created_at": datetime.now(timezone.utc),
    })
    return Token(access_token=_create_token(email), email=email)


@api_router.post("/auth/login", response_model=Token)
async def auth_login(form: Annotated[OAuth2PasswordRequestForm, Depends()]):
    email = _norm_email(form.username)
    admin = await db.admins.find_one({"email": email}, {"_id": 0})
    valid = pwd_ctx.verify(form.password, admin["password_hash"] if admin else DUMMY_HASH)
    if not admin or not valid:
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    return Token(access_token=_create_token(email), email=email)


@api_router.get("/auth/me")
async def auth_me(admin: AdminDep):
    return {"email": admin["email"]}


@api_router.post("/auth/promote", response_model=Token)
async def auth_promote(inp: AdminCredentials, actor: AdminDep):
    email = _norm_email(inp.email)
    existing = await db.admins.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Já é admin")
    await db.admins.insert_one({
        "email": email,
        "password_hash": pwd_ctx.hash(inp.password),
        "promoted_by": actor["email"],
        "created_at": datetime.now(timezone.utc),
    })
    return Token(access_token=_create_token(email), email=email)


@api_router.get("/auth/admins")
async def auth_list_admins(_: AdminDep):
    docs = await db.admins.find({}, {"_id": 0, "password_hash": 0}).to_list(200)
    return docs


# ---------- Invites ----------
@api_router.post("/invites", response_model=Invite)
async def create_invite(inp: InviteCreate, admin: Optional[dict] = Depends(get_optional_admin)):
    # Aberto a qualquer um: qualquer jogador pode gerar um link de convite
    creator = admin["email"] if admin else "player"
    inv = Invite(type=inp.type, created_by=creator)
    await db.invites.insert_one(inv.model_dump())
    return inv


@api_router.get("/invites/{token}")
async def get_invite(token: str):
    inv = await db.invites.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Convite não encontrado")
    return inv


@api_router.post("/invites/{token}/accept", response_model=Player)
async def accept_invite(token: str, inp: InviteAccept):
    inv = await db.invites.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Convite inválido")
    name = inp.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome obrigatório")
    p = Player(name=name, type=inv["type"])
    await db.players.insert_one(p.model_dump())
    await db.invites.update_one({"token": token}, {"$inc": {"uses": 1}})
    return p


@api_router.get("/invites")
async def list_invites(_: AdminDep):
    docs = await db.invites.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.delete("/invites/{invite_id}")
async def delete_invite(invite_id: str, _: AdminDep):
    res = await db.invites.delete_one({"id": invite_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Convite não encontrado")
    return {"ok": True}


# Players
@api_router.get("/players", response_model=List[Player])
async def list_players():
    docs = await db.players.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return [Player(**d) for d in docs]


@api_router.post("/players", response_model=Player)
async def create_player(inp: PlayerCreate, _: AdminDep):
    name = inp.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome obrigatório")
    p = Player(
        name=name,
        type=inp.type,
        monthly_fee=inp.monthly_fee,
        churrasco_fee=inp.churrasco_fee,
        guest_fee=inp.guest_fee,
    )
    await db.players.insert_one(p.model_dump())
    return p


@api_router.put("/players/{player_id}", response_model=Player)
async def update_player(player_id: str, inp: PlayerUpdate, _: AdminDep):
    existing = await db.players.find_one({"id": player_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Jogador não encontrado")
    update: dict = {}
    if inp.name is not None:
        n = inp.name.strip()
        if not n:
            raise HTTPException(status_code=400, detail="Nome obrigatório")
        update["name"] = n
    if inp.type is not None:
        update["type"] = inp.type
    if inp.clear_monthly_fee:
        update["monthly_fee"] = None
    elif inp.monthly_fee is not None:
        if inp.monthly_fee < 0:
            raise HTTPException(status_code=400, detail="Valor inválido")
        update["monthly_fee"] = float(inp.monthly_fee)
    if inp.clear_churrasco_fee:
        update["churrasco_fee"] = None
    elif inp.churrasco_fee is not None:
        if inp.churrasco_fee < 0:
            raise HTTPException(status_code=400, detail="Valor inválido")
        update["churrasco_fee"] = float(inp.churrasco_fee)
    if inp.clear_guest_fee:
        update["guest_fee"] = None
    elif inp.guest_fee is not None:
        if inp.guest_fee < 0:
            raise HTTPException(status_code=400, detail="Valor inválido")
        update["guest_fee"] = float(inp.guest_fee)
    if update:
        await db.players.update_one({"id": player_id}, {"$set": update})
    doc = await db.players.find_one({"id": player_id}, {"_id": 0})
    return Player(**doc)


@api_router.delete("/players/{player_id}")
async def delete_player(player_id: str, _: AdminDep):
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

    # monthly payments — chave por (player_id, month)
    all_months = list({w["week_start"][:7] for w in weeks_docs})
    paid_set: set = set()
    if all_months and player_ids:
        cursor = db.monthly_payments.find(
            {"player_id": {"$in": player_ids}, "month": {"$in": all_months}, "paid": True}, {"_id": 0}
        )
        async for mp in cursor:
            paid_set.add((mp["player_id"], mp["month"]))

    per_week: dict = {wid: [] for wid in week_ids}
    for a in all_att:
        if a["week_id"] in per_week:
            per_week[a["week_id"]].append(a)

    out = []
    for w in weeks_docs:
        week_monday = date.fromisoformat(w["week_start"])
        month = _current_month_key(week_monday)
        atts = per_week.get(w["id"], [])
        tc = tch = tp = cm = cmp = cc = ccp = cch = cp = 0
        for a in atts:
            p = players_by_id.get(a["player_id"])
            if not p:
                continue
            is_paid = bool(a.get("paid"))
            churras_price = _price_churrasco(p)
            if p["type"] == "mensalista":
                paid_month = (p["id"], month) in paid_set
                if _mensalista_blocked(week_monday, paid_month):
                    cmp += 1
                    continue
                cm += 1
            else:
                if not is_paid:
                    ccp += 1
                    continue
                tc += _price_guest(p)
                cc += 1
            if a.get("churrasco"):
                tch += churras_price
                cch += 1
            if is_paid:
                base_paid = _price_guest(p) if p["type"] == "convidado" else 0
                churras_paid = churras_price if a.get("churrasco") else 0
                tp += base_paid + churras_paid
                cp += 1
        total_arr = tc + tch
        out.append({
            "week": w,
            "summary": {
                "total_mensalistas": 0,
                "total_convidados": tc,
                "total_churrasco": tch,
                "total_arrecadado": total_arr,
                "total_pago": tp,
                "total_pendente": total_arr - tp,
                "count_mensalistas": cm,
                "count_mensalistas_pendentes": cmp,
                "count_convidados": cc,
                "count_convidados_pendentes": ccp,
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


# Monthly payments (mensalistas)
@api_router.get("/monthly/current")
async def get_monthly_current():
    today = datetime.now(timezone.utc).date()
    month = _current_month_key(today)
    deadline = _fifth_business_day(today.year, today.month)
    mensalistas = await db.players.find({"type": "mensalista"}, {"_id": 0}).sort("name", 1).to_list(500)
    ids = [m["id"] for m in mensalistas]
    paid_map: dict = {}
    if ids:
        cursor = db.monthly_payments.find(
            {"player_id": {"$in": ids}, "month": month}, {"_id": 0}
        )
        async for mp in cursor:
            paid_map[mp["player_id"]] = mp
    items = []
    total_pago = 0.0
    total_previsto = 0.0
    for p in mensalistas:
        mp = paid_map.get(p["id"])
        is_paid = bool(mp and mp.get("paid"))
        fee = _price_monthly(p)
        items.append({
            "player": p,
            "paid": is_paid,
            "paid_at": (mp.get("paid_at") if mp else None),
            "blocked": _mensalista_blocked(today, is_paid),
            "monthly_fee": fee,
        })
        total_previsto += fee
        if is_paid:
            total_pago += fee
    return {
        "month": month,
        "deadline": deadline.isoformat(),
        "past_deadline": today > deadline,
        "price": PRICE_MENSALISTA,
        "items": items,
        "count_pagos": sum(1 for i in items if i["paid"]),
        "count_pendentes": sum(1 for i in items if not i["paid"]),
        "total_pago": total_pago,
        "total_previsto": total_previsto,
    }


@api_router.put("/monthly")
async def upsert_monthly(inp: MonthlyPaymentUpsert, _: AdminDep):
    now = datetime.now(timezone.utc)
    existing = await db.monthly_payments.find_one(
        {"player_id": inp.player_id, "month": inp.month}, {"_id": 0}
    )
    update = {
        "player_id": inp.player_id,
        "month": inp.month,
        "paid": inp.paid,
        "updated_at": now,
    }
    if inp.paid:
        update["paid_at"] = now
    else:
        update["paid_at"] = None
    if existing:
        await db.monthly_payments.update_one(
            {"player_id": inp.player_id, "month": inp.month},
            {"$set": update},
        )
    else:
        doc = MonthlyPayment(
            player_id=inp.player_id,
            month=inp.month,
            paid=inp.paid,
            paid_at=now if inp.paid else None,
        )
        await db.monthly_payments.insert_one(doc.model_dump())
    return {"player_id": inp.player_id, "month": inp.month, "paid": inp.paid}


# Expenses
@api_router.get("/expenses")
async def list_expenses(month: Optional[str] = None):
    query: dict = {}
    if month:
        query["month"] = month
    docs = await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(2000)
    return docs


@api_router.post("/expenses", response_model=Expense)
async def create_expense(inp: ExpenseCreate, _: AdminDep):
    desc = inp.description.strip()
    if not desc:
        raise HTTPException(status_code=400, detail="Descrição obrigatória")
    if inp.amount <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")
    date_iso = (inp.date or datetime.now(timezone.utc).date().isoformat())[:10]
    e = Expense(
        category=inp.category,
        description=desc,
        amount=float(inp.amount),
        date=date_iso,
        month=date_iso[:7],
    )
    await db.expenses.insert_one(e.model_dump())
    return e


@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, _: AdminDep):
    res = await db.expenses.delete_one({"id": expense_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    return {"ok": True}


@api_router.get("/expenses/summary")
async def expenses_summary(month: Optional[str] = None):
    m = month or _current_month_key()
    docs = await db.expenses.find({"month": m}, {"_id": 0}).to_list(2000)
    by_cat = {"campo": 0.0, "churrasco": 0.0, "outros": 0.0}
    for d in docs:
        cat = d.get("category", "outros")
        by_cat[cat] = by_cat.get(cat, 0.0) + float(d.get("amount", 0))
    total = sum(by_cat.values())
    return {"month": m, "by_category": by_cat, "total": total, "count": len(docs)}


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
async def update_pix_settings(inp: PixSettings, _: AdminDep):
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
async def update_team_settings(inp: TeamSettings, _: AdminDep):
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
