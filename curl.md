# ============================================
# WelfareData API - Comandos cURL
# ============================================

# ----- HEALTH CHECK -----
curl http://localhost:8080/health

# ----- AUTENTICAÇÃO -----

# 1. Registrar novo usuário
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin User","email":"admin@welfare.com","password":"password123","role":"admin"}'

curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Regular User","email":"user@welfare.com","password":"password123","role":"user"}'

# 2. Login (salva cookie HttpOnly)
curl -i -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste@welfare.com","password":"password123"}' \
  -c cookies.txt

# 3. Verificar usuário logado
curl -X GET http://localhost:8080/auth/me -b cookies.txt

# 4. Testar rota admin-only
curl -X GET http://localhost:8080/auth/admin-only -b cookies.txt

# 5. Logout
curl -X POST http://localhost:8080/auth/logout -b cookies.txt

# ----- CRUD DE ESPÉCIES -----

# 1. Criar espécie (requer admin)
curl -X POST http://localhost:8080/species \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Bovino","pathname":"bovino","description":"Gado de corte e leite"}'

curl -X POST http://localhost:8080/species \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Suíno","pathname":"suino","description":"Criação de porcos"}'

curl -X POST http://localhost:8080/species \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Aves","pathname":"aves","description":"Frangos, galinhas e outras aves"}'

# 2. Listar todas espécies (qualquer usuário autenticado)
curl -X GET http://localhost:8080/species -b cookies.txt

# 3. Atualizar espécie (requer admin) - substitua SPECIE_ID
curl -X PUT http://localhost:8080/species/SPECIE_ID \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Bovinos","description":"Gado de corte, leite e dupla aptidão"}'

# 4. Deletar espécie (requer admin) - substitua SPECIE_ID
curl -X DELETE http://localhost:8080/species/SPECIE_ID -b cookies.txt

# ----- EXEMPLOS COM ID REAL -----
# Substitua 6982b34b23489c7d39b8d3c2 pelo ID retornado ao criar

# Atualizar
curl -X PUT http://localhost:8080/species/6982b34b23489c7d39b8d3c2 \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Bovinos Atualizados","description":"Nova descrição"}'

# Deletar
curl -X DELETE http://localhost:8080/species/6982b34b23489c7d39b8d3c2 -b cookies.txt

# Criar processograma
curl -X POST http://localhost:8080/processograms \
  -b cookies.txt \
  -F "file=@test2.svg" \
  -F "name=Pigs" \
  -F "specieId=6982d3da664702d6feacd480" \
  -F "productionModuleId=6989011bc946774cb98eb1ec"