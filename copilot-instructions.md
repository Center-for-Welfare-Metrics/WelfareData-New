# PROJETO: WelfareData 2.0 (Refactor)

## ARQUITETURA
- **Backend:** Node.js v22, Express, TypeScript Strict Mode.
- **Database:** MongoDB com Mongoose (Syntax moderna, Async/Await obrigatório).
- **Frontend:** Next.js 15 (App Router), React 19, TypeScript.
- **Auth:** JWT em HttpOnly Cookies.
- **Libs Obrigatórias:** Zod (validação), TanStack Query v5 (estado), Jest (testes).

## REGRAS DE OURO (STRICT)
1. **Clean Architecture:** Backend deve seguir estritamente: Controller -> UseCase -> Service -> Repository/Model.
2. **Tipagem:** Nada de `any`. Use interfaces TypeScript compartilhadas (`types/`) sempre que possível.
3. **API Contracts:** Use Zod para validar Inputs (request body) e Outputs.
4. **SVG Processing:** O processamento de SVG (SVGO/JSDOM) deve ser isolado em Services puros, nunca dentro de Controllers.
5. **Segurança:** Nunca exponha segredos. Use variáveis de ambiente tipadas.

## CONTEXTO DE NEGÓCIO
O sistema gerencia "Processogramas" (fluxos de bem-estar animal).
- Entidades principais: User, Specie, ProductionModule, Processogram.
- Feature Crítica: Upload de SVG que é processado, "quebrado" em imagens rasterizadas e salvo no Google Cloud Storage.