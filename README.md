# Rifa Certa MVP v0.5

## Novidades
- Fluxo Pix preparado para Mercado Pago Checkout Transparente via Orders API.
- Geração de QR Code, Pix Copia e Cola e link de pagamento quando há credencial configurada.
- `X-Idempotency-Key` em cada criação de order.
- Endpoint de Webhook Mercado Pago.
- Validação HMAC SHA-256 do header `x-signature`.
- Consulta da order no backend antes de marcar números como vendidos.
- Só confirma automaticamente quando a order retorna `processed / accredited`.
- Sem credencial, continua funcionando em modo demo.
- Corrigido o fluxo público para usar a campanha ativa e endpoints por campanha.

## Como rodar localmente
1. Instale Node.js 20+
2. Rode `npm install`
3. Configure as variáveis do `.env.example` no seu sistema/terminal
4. Rode `npm run dev`
5. Cliente: http://localhost:3000
6. Admin: http://localhost:3000/admin.html

## Para testar Pix real em ambiente de teste
Você precisa criar uma aplicação no Mercado Pago Developers e usar o Access Token de teste.
O webhook só poderá ser testado de ponta a ponta quando o servidor estiver publicado em uma URL HTTPS acessível pela internet.

## Ainda antes da produção
- PostgreSQL real
- hash de senha e autenticação persistente
- HTTPS/hospedagem
- rate limiting
- logs e backups
- política de privacidade / termos
- validação jurídica da modalidade de campanha
- testes de concorrência de reservas

Use somente para campanhas permitidas pela legislação aplicável.
