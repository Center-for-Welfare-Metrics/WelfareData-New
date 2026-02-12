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
  -d '{"name":"Pigs Teste","pathname":"pigs","description":"pigs teste de processograma"}'

curl -X POST http://localhost:8080/species \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"pigs teste att","pathname":"pigsatt","description":"Criação de porcos att"}'

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

# Criar Módulo
curl -X POST http://localhost:8080/production-modules \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Hatchery","slug":"hatchery","specieId":"698bdadc262e0de57909e216","description":"Incubação de ovos"}'


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
  -F "specieId=698bf5b3741ecbd3dfc30ce6" \
  -F "productionModuleId=698d08f388c7d6b69e16d8c2"

  curl -X POST http://localhost:8080/processograms \
  -b cookies.txt \
  -F "file=@test3.svg" \
  -F "name=Pigs" \
  -F "specieId=698bd2ac8d74a9dc986074c7" \
  -F "productionModuleId=698bd3818d74a9dc986074cb"

  # Update processograma
  curl -X PUT http://localhost:8080/processograms/698bf5b3741ecbd3dfc30ce6 \
   -b cookies.txt \
   -F "file=@teste4.svg" \
   -F "name=att teste"

   curl -X PUT http://localhost:8080/processograms/698914593bef77b80d6611fe -b cookies.txt -F "file=@test.svg" -F "name=Teste Update SVG"

# 1. Criar módulo para uma espécie (requer admin)
curl -X POST http://localhost:8080/production-modules \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Hatchery","slug":"hatchery","specieId":"698bf5b3741ecbd3dfc30ce6","description":"Engorda de Porcos para Abate"}'


  # Disparar análise
curl -X POST http://localhost:8080/processograms/698d0ba6b239e4365a8d19ac/analyze \
  -b cookies.txt

### Consultar resultados

# Ver descrições de um elemento específico
curl "http://localhost:8080/processogram-data?processogramId=698bdcf03d60b37e230bc9e9&elementId=laying_hen--lf" \
  -b cookies.txt

# Ver perguntas de quiz
curl "http://localhost:8080/processogram-questions?processogramId=698bdcf03d60b37e230bc9e9&elementId=laying_hen--lf" \
  -b cookies.txt
