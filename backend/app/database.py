
import os

import psycopg2

from dotenv import load_dotenv

# Carrega as variáveis de ambiente do arquivo env
load_dotenv()


# FUNÇÃO DE CONEXÃO COM O BANCO DE DADOS
def get_db_connection():

    # Pega a URL completa de conexão guardada no env
    database_url = os.getenv("DATABASE_URL")

    # Verifica se a URL foi configurada
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL não foi definida no arquivo env"
        )

    # Abre a conexão segura com o PostgreSQL do Supabase
    dados = psycopg2.connect(
        database_url,
        sslmode="require"
    )

    return dados


def get_db():

    # Abre a conexão com o banco
    dados = get_db_connection()

    try:
        # Entrega a conexão para a rota que solicitou
        yield dados

    finally:
        # Fecha a conexão ao terminar a requisição
        dados.close()
