# BOT GPT – Conversational AI Chatbot with Open & Grounded (RAG) Modes

Production-grade backend for a turn-based chatbot supporting two modes:

- **Open Chat Mode** — general conversation with external LLM  
- **Grounded Chat / RAG Mode** — conversation grounded in user-uploaded documents (PDFs, articles) using Retrieval-Augmented Generation

Fully satisfies REST CRUD requirements, conversation persistence, token-aware context management, user-scoped data (JWT auth), and scalable architecture thinking.

**Assignment focus:** Clean backend design · REST API maturity · Data modeling · LLM integration via API · Cost & scale awareness

## Features

- Two conversation modes: open and grounded (RAG)
- Full REST CRUD for conversations & messages
- Document upload & association with conversations
- Semantic chunking + vector-based retrieval (pgvector)
- Hybrid retrieval + re-ranking
- Multilingual support (Spanish doc + English query, etc.)
- Token-aware context management (sliding window + summarization)
- JWT authentication & user-scoped data
- Production-grade error handling, logging & scaling plan
- Dockerized + GitHub Actions CI

## Tech Stack

| Layer              | Technology                          | Purpose                                      |
|--------------------|-------------------------------------|----------------------------------------------|
| Backend            | FastAPI (Python 3.12+)              | Async REST API, auto docs, Pydantic validation |
| Database           | PostgreSQL 17 + pgvector            | ACID + built-in vector search for RAG        |
| Cache              | Redis                               | Hot chunk cache, rate limiting               |
| Storage            | AWS S3 / Supabase Storage           | Raw document files (PDFs)                    |
| Authentication     | JWT Bearer                          | User-scoped conversations & documents        |
| LLM                | External API (OpenAI GPT-4o / Grok / Claude) | Generation & embeddings                   |
| Document Parsing   | LlamaParse (design)                 | Tables, images, layout-aware extraction      |
| Embeddings         | Cohere embed-v4 (multilingual)      | Cross-lingual semantic search                |
| Re-ranking         | Cohere rerank-3                     | Precision boost & hallucination reduction    |
| CI / Deployment    | GitHub Actions · Docker             | Lint, test, build pipeline                   |

## Project Structure
