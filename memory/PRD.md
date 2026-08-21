# FutLista - Lista de Presença do Futebol

## Visão Geral
App mobile (Expo/React Native) para gerenciar a lista de presença semanal de uma turma de futebol amador, com controle de mensalistas, convidados, churrasco semanal, pagamento via Pix e despesas do time.

## Regras de negócio
- **Futebol toda terça às 21h** (fixo no app)
- **Mensalista**: R$ 60/mês (pagamento mensal, prazo até o 5º dia útil de cada mês)
- **Convidado**: R$ 20 por jogo/semana
- **Churrasco semanal**: R$ 20 por integrante
- **Lista de espera**: Convidado attending sem pagar OU mensalista sem pagar o mês corrente e passado do prazo → vai para lista de espera (aparece no app com badge amarelo, mas não conta no total nem entra na lista compartilhada como confirmado)
- Sem login: qualquer pessoa acessa e confirma presença

## Funcionalidades
- ✅ Cadastro de jogadores (nome + tipo mensalista/convidado)
- ✅ Confirmação de presença semanal com toggle por jogador
- ✅ Opção "+ Churrasco R$20" por jogador
- ✅ "Marcar pago" (convidado) — controle honra
- ✅ Aba "Mensalidades" — admin marca quem pagou o mês
- ✅ Aba "Despesas" — categorias: campo, churrasco, outros; com resumo mensal
- ✅ Pix manual: chave Pix cadastrada pelo admin, QR code e cópia rápida
- ✅ Resumo financeiro semanal (só convidados + churrasco)
- ✅ Lista de espera visível na Home
- ✅ Nome/emoji da turma personalizáveis
- ✅ Compartilhar lista formatada via WhatsApp (com link do app + horário)
- ✅ Botão "convidar amigos" para enviar link do app
- ✅ Histórico por jogador
- ✅ Filtro por tipo (Todos/Mensalistas/Convidados)

## Backend
FastAPI + MongoDB. Rotas principais (todas com `/api`):
- `GET/POST/DELETE /players`
- `GET /weeks/current`, `GET /weeks`, `POST /weeks/new`
- `PUT /attendance`
- `GET /players/{id}/history`
- `GET/PUT /settings/pix`, `GET/PUT /settings/team`
- `GET /monthly/current`, `PUT /monthly`
- `GET/POST/DELETE /expenses`, `GET /expenses/summary`

## Frontend
Expo Router. Rotas: `/`, `/add-player`, `/pix`, `/settings`, `/weeks`, `/history/[playerId]`, `/monthly`, `/expenses`.

## Integrações
- Nenhuma integração externa. Pix é manual (chave + QR gerado localmente).
- Compartilhamento via `expo-linking`.

## Próximas features possíveis
- Notificações push (lembrar de confirmar presença toda semana)
- Upload de comprovante de pagamento
- Foto/logo customizada da turma
- Multi-turma
