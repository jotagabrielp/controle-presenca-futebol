# FutLista - Lista de Presença do Futebol

## Visão Geral
App mobile (Expo/React Native) para gerenciar a lista de presença semanal de uma turma de futebol amador, com controle de mensalistas, convidados, churrasco semanal e pagamento via Pix.

## Regras de negócio
- **Mensalista**: R$ 60 por semana
- **Convidado**: R$ 20 por semana
- **Churrasco semanal**: R$ 20 por integrante que optar participar
- Sem login: qualquer pessoa acessa e confirma presença
- Uma nova lista por semana (segunda-feira como início)

## Funcionalidades
- ✅ Cadastro de jogadores (nome + tipo mensalista/convidado)
- ✅ Confirmação de presença semanal com toggle por jogador
- ✅ Opção "+ Churrasco R$20" por jogador
- ✅ "Marcar pago" por jogador (honra)
- ✅ Pix manual: chave Pix cadastrada pelo admin, QR code e cópia rápida
- ✅ Resumo financeiro completo (mensalistas + convidados + churrasco, pago vs pendente)
- ✅ Semanas anteriores com resumo por semana
- ✅ Histórico por jogador (presenças, churrasco, pagos)
- ✅ Compartilhar lista formatada via WhatsApp
- ✅ Filtro por tipo (Todos/Mensalistas/Convidados)

## Backend
FastAPI + MongoDB.
Rotas principais (todas com `/api`):
- `GET/POST/DELETE /players`
- `GET /weeks/current`, `GET /weeks`, `POST /weeks/new`
- `PUT /attendance` (upsert attending/churrasco/paid)
- `GET /players/{id}/history`
- `GET/PUT /settings/pix`

## Frontend
Expo Router. Rotas: `/`, `/add-player`, `/pix`, `/settings`, `/weeks`, `/history/[playerId]`.
Design: personalidade "Tactile / Playful" — verde gramado + amarelo mostarda + creme.

## Integrações
- Nenhuma integração externa. Pix é manual (chave + QR gerado localmente com `react-native-qrcode-svg`).
- Compartilhamento via `expo-linking` (whatsapp://send + fallback wa.me).

## Próximos passos possíveis
- Notificações push para lembrar de confirmar presença
- Upload de comprovante de pagamento
- Multi-turma
