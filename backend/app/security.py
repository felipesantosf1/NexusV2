
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credenciais: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
):
    if credenciais is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="É necessário fazer login.",
        )

    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    chave = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")

    if not url or not chave:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Configure a autenticação no backend.",
        )

    try:
        resposta = httpx.get(
            f"{url}/auth/v1/user",
            headers={
                "apikey": chave,
                "Authorization": (
                    f"Bearer {credenciais.credentials}"
                ),
            },
            timeout=8.0,
        )
    except httpx.RequestError as erro:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível validar a sessão.",
        ) from erro

    if resposta.status_code in (401, 403):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
        )

    if resposta.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Falha no serviço de autenticação.",
        )

    usuario = resposta.json()

    if not usuario.get("id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não identificado.",
        )

    return usuario
