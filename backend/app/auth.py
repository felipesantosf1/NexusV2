
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

import jwt
from jwt import PyJWKClient
from jwt.exceptions import (
    InvalidTokenError,
    PyJWKClientConnectionError,
    PyJWKClientError,
)

from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

load_dotenv()

esquema_bearer = HTTPBearer(auto_error=False)

# Cache das chaves públicas de assinatura do Supabase.
# O conjunto de chaves é atualizado periodicamente.
_jwks_client = None
_jwks_url_cache = None


def obter_cliente_jwks(supabase_url: str):
    global _jwks_client, _jwks_url_cache

    url = (
        f"{supabase_url.rstrip('/')}"
        "/auth/v1/.well-known/jwks.json"
    )

    if _jwks_client is None or _jwks_url_cache != url:
        _jwks_client = PyJWKClient(
            url,
            cache_jwk_set=True,
            lifespan=300,
            timeout=5,
        )
        _jwks_url_cache = url

    return _jwks_client


def validar_token_legado(
    token: str,
    supabase_url: str,
    supabase_key: str,
):
    """
    Compatibilidade temporária com tokens HS256 antigos.
    A validação continua sendo feita pelo Supabase Auth.
    """

    requisicao = Request(
        url=f"{supabase_url.rstrip('/')}/auth/v1/user",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {token}",
        },
        method="GET",
    )

    try:
        with urlopen(requisicao, timeout=5) as resposta:
            usuario = json.loads(
                resposta.read().decode("utf-8")
            )

    except HTTPError as erro:
        if erro.code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Sessão inválida ou expirada.",
            ) from erro

        raise HTTPException(
            status_code=503,
            detail="Não foi possível validar a sessão antiga.",
        ) from erro

    except (URLError, TimeoutError) as erro:
        raise HTTPException(
            status_code=503,
            detail="Serviço de autenticação indisponível.",
        ) from erro

    try:
        return {"id": UUID(usuario["id"])}
    except (KeyError, ValueError, TypeError) as erro:
        raise HTTPException(
            status_code=401,
            detail="Não foi possível identificar o usuário.",
        ) from erro


def get_current_user(
    credenciais: HTTPAuthorizationCredentials | None = Depends(
        esquema_bearer
    )
):
    if credenciais is None:
        raise HTTPException(
            status_code=401,
            detail="Autenticação necessária.",
        )

    supabase_url = os.getenv("SUPABASE_URL")

    if not supabase_url:
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_URL não foi configurada.",
        )

    token = credenciais.credentials

    try:
        cabecalho = jwt.get_unverified_header(token)
    except InvalidTokenError as erro:
        raise HTTPException(
            status_code=401,
            detail="Token inválido.",
        ) from erro

    algoritmo = cabecalho.get("alg")

    # Caminho rápido: verifica localmente tokens ES256.
    if algoritmo == "ES256":
        try:
            cliente = obter_cliente_jwks(supabase_url)

            chave = cliente.get_signing_key_from_jwt(token).key

            claims = jwt.decode(
                token,
                chave,
                algorithms=["ES256"],
                audience="authenticated",
                issuer=f"{supabase_url.rstrip('/')}/auth/v1",
                options={
                    "require": ["exp", "sub", "aud", "iss"]
                },
            )

            usuario_id = UUID(claims["sub"])

            return {"id": usuario_id}

        except PyJWKClientConnectionError as erro:
            raise HTTPException(
                status_code=503,
                detail="Não foi possível obter as chaves de autenticação.",
            ) from erro

        except PyJWKClientError as erro:
            raise HTTPException(
                status_code=401,
                detail="A chave de assinatura do token não foi encontrada.",
            ) from erro

        except (InvalidTokenError, ValueError, KeyError, TypeError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Sessão inválida ou expirada.",
            ) from erro

    # Compatibilidade: tokens HS256 antigos continuam sendo
    # validados pelo Supabase, sem aceitar o algoritmo às cegas.
    if algoritmo == "HS256":
        supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY")

        if not supabase_key:
            raise HTTPException(
                status_code=500,
                detail="SUPABASE_PUBLISHABLE_KEY não foi configurada.",
            )

        return validar_token_legado(
            token,
            supabase_url,
            supabase_key,
        )

    # Não aceitar algoritmos diferentes dos previstos.
    raise HTTPException(
        status_code=401,
        detail="Algoritmo de autenticação não permitido.",
    )
