import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


# Carrega sempre o .env que fica na pasta backend,
# independentemente da pasta em que o Uvicorn for iniciado.
BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env"
load_dotenv(ENV_FILE)


def get_db_connection():
    """Abre uma conexão com o PostgreSQL do Supabase."""
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError(
            f"DATABASE_URL não foi definida em {ENV_FILE}"
        )

    return psycopg2.connect(
        database_url,
        sslmode="require",
        connect_timeout=10,
    )


def get_db():
    """Entrega uma conexão à rota e garante rollback/fechamento."""
    dados = get_db_connection()

    try:
        yield dados
    except Exception:
        # Desfaz alterações pendentes quando a rota falha.
        dados.rollback()
        raise
    finally:
        dados.close()
