# API Endpoints: Auth

## POST /auth/register

### Request Body (JSON)
```json
{
  "name": "string (min 3)",
  "email": "string (email válido)",
  "password": "string (min 6)",
  "role": "admin | user" // opcional, padrão 'user'
}
```

### Respostas
- **201 Created**
  ```json
  {
    "id": "string",
    "name": "string",
    "email": "string"
  }
  ```
- **400 Bad Request** (Erro de validação)
  ```json
  {
    "error": "Validation Error",
    "details": [ ... ]
  }
  ```
- **409 Conflict** (Usuário já existe)
  ```json
  {
    "error": "User already exists"
  }
  ```
- **500 Internal Server Error**
  ```json
  {
    "error": "Internal Server Error"
  }
  ```

### Observações
- Nunca retorna senha ou hash.
- O Controller apenas orquestra a chamada ao caso de uso.
- Adicione o middleware `cookie-parser` e registre a rota `/auth` no `server.ts`.
