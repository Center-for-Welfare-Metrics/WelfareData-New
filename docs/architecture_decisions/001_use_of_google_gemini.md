# ADR-001: Adoção do Google Gemini como Provider de IA

**Status:** Aceito  
**Data:** 2025  
**Autores:** WFI Engineering Team

---

## Contexto

O WelfareData Backend necessita de capacidades de inteligência artificial para duas funções críticas:

1. **Análise Bulk:** Geração automatizada de descrições científicas para elementos de processogramas de produção animal, baseando-se em hierarquia SVG (IDs, níveis, relações parentais).
2. **Chat Contextual:** Interface conversacional que permite aos usuários interagir com os dados técnicos dos processogramas usando linguagem natural, com streaming em tempo real.

Anteriormente, foi avaliado o uso do **DeepSeek** como provider de IA. A avaliação identificou limitações em integração, disponibilidade de SDKs oficiais para Node.js e suporte a modos de resposta estruturada (JSON mode).

---

## Decisão

Adotar o **Google Gemini** (via SDK `@google/generative-ai`) como provider exclusivo de IA para o WelfareData Backend.

### Modelos Utilizados

| Função | Modelo | Justificativa |
|--------|--------|---------------|
| Análise Bulk (descrições) | `gemini-2.5-flash` | Alta capacidade de raciocínio, JSON mode nativo, temperature 0.4 para balanço entre criatividade e precisão |
| Análise Bulk (perguntas) | `gemini-2.5-flash` | Gera 1 pergunta de quiz por elemento, temperature 0.5, depende das descrições geradas na etapa anterior |
| Chat Streaming | `gemini-2.5-flash` | Otimizado para latência, streaming nativo via SDK, temperature 0.3 para foco factual |

---

## Motivação

### 1. Integração Nativa com Ecossistema Google

O WelfareData já utiliza **Google Cloud Storage (GCS)** com Application Default Credentials (ADC). A adoção do Gemini mantém o ecossistema coeso, simplificando gestão de credenciais, billing e suporte.

### 2. SDK Oficial e Maduro

O pacote `@google/generative-ai` oferece:
- Tipagem TypeScript nativa
- `generateContent()` com `responseMimeType: 'application/json'` (JSON mode sem parsing frágil)
- `startChat()` + `sendMessageStream()` para streaming
- `systemInstruction` para injeção de contexto RAG

### 3. Janela de Contexto

O Gemini 2.5 Flash suporta janelas de contexto de até 1M tokens, permitindo injetar todas as descrições de um processograma como system instruction sem truncamento.

### 4. Multimodalidade Futura

O Gemini é nativamente multimodal (texto, imagem, vídeo, áudio). Isso abre possibilidade futura de análise direta dos PNGs rasterizados ou dos SVGs como imagem, sem depender exclusivamente de parsing textual.

### 5. Custo/Performance

O tier Flash oferece excelente relação custo/performance para os volumes esperados do WelfareData. O free tier cobre desenvolvimento e testes, com custos de produção previsíveis.

---

## Alternativas Consideradas

### DeepSeek

- **Avaliado em:** Iteração anterior do projeto
- **Descartado por:** SDK não oficial para Node.js, ausência de JSON mode nativo, incerteza sobre disponibilidade de API em regiões, sem integração com ecossistema Google
- **Ponto forte:** Custo potencialmente menor para alto volume

### OpenAI (GPT-4 / GPT-4o)

- **Não avaliado formalmente:** Ecossistema diferente (Azure/OpenAI), sem vantagem de integração com GCS/ADC, custo superior para o tier equivalente
- **Consideração futura:** Possível provider alternativo se necessário multi-provider

### Modelos Open Source (Llama, Mistral)

- **Não avaliado:** Requereria infraestrutura de hosting própria (GPU), complexidade operacional incompatível com o estágio atual do projeto
- **Consideração futura:** Para cenários de dados sensíveis ou compliance restritivo

---

## Consequências

### Positivas

- Ecossistema unificado Google (GCS + Gemini) simplifica operações
- SDK oficial com tipagem forte reduz erros de integração
- JSON mode elimina parsing frágil de respostas
- Streaming nativo viabiliza chat em tempo real sem bibliotecas adicionais
- Janela de contexto ampla suporta processogramas com centenas de elementos

### Negativas

- **Vendor lock-in:** Dependência do ecossistema Google. Mitigação: a interface `GeminiService` pode ser abstraída para suportar múltiplos providers no futuro
- **Custos variáveis:** Consumo de API proporcional ao número de análises. Mitigação: cache de descrições no MongoDB (upsert, não regenera sem necessidade)
- **Rate limits (Free Tier):** O tier gratuito tem limites que podem ser atingidos durante desenvolvimento intensivo. Mitigação: backoff e retry, ou upgrade para tier pago

### Riscos Aceitos

- Mudanças no pricing do Gemini podem impactar custos operacionais
- Deprecação de modelos requer atualização periódica (ex: migração de `1.5-flash` → `2.0-flash` → `2.5-flash` já realizada)
- Disponibilidade do serviço depende do Google Cloud (SLA 99.9%)

---

## Referências

- [Google Generative AI SDK](https://github.com/google-gemini/generative-ai-js)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Google AI Studio](https://aistudio.google.com/)
- [WFI Engineering Playbook — Seção 6: Security](../security_model.md)
