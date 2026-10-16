
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


# VALIDAÇÃO DE SESSÃO: JWT LOCAL QUANDO A CHAVE É ASSIMÉTRICA
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
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY")

    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=500,
            detail="SUPABASE_URL ou SUPABASE_PUBLISHABLE_KEY não configurada.",
        )

    token = credenciais.credentials

    # Identifica o algoritmo usado para assinar o token.
    try:
        cabecalho = jwt.get_unverified_header(token)
    except InvalidTokenError as erro:
        raise HTTPException(
            status_code=401,
            detail="Token de sessão inválido.",
        ) from erro

    algoritmo = cabecalho.get("alg")

    # Tokens HS256 antigos continuam usando a validação do Supabase Auth.
    if algoritmo == "HS256":
        return validar_token_legado(
            token,
            supabase_url,
            supabase_key,
        )

    # Aceita somente os algoritmos assimétricos previstos.
    if algoritmo not in ("ES256", "RS256"):
        raise HTTPException(
            status_code=401,
            detail="Algoritmo de assinatura não permitido.",
        )

    # Busca a chave pública e verifica a assinatura do JWT.
    try:
        cliente_jwks = obter_cliente_jwks(supabase_url)
        chave = cliente_jwks.get_signing_key_from_jwt(token)

    except PyJWKClientConnectionError as erro:
        raise HTTPException(
            status_code=503,
            detail="Não foi possível acessar as chaves públicas do Supabase.",
        ) from erro

    except PyJWKClientError as erro:
        raise HTTPException(
            status_code=401,
            detail="Não foi possível validar a assinatura do token.",
        ) from erro

    # Valida assinatura, validade, emissor e destinatário do token.
    try:
        claims = jwt.decode(
            token,
            chave.key,
            algorithms=[algoritmo],
            audience="authenticated",
            issuer=f"{supabase_url.rstrip('/')}/auth/v1",
            options={
                "require": ["exp", "sub", "aud", "iss"],
            },
        )

        if claims.get("role") != "authenticated":
            raise HTTPException(
                status_code=401,
                detail="O token não pertence a uma sessão autenticada.",
            )

        # Mantém o formato de usuário esperado pelas rotas existentes.
        return {
            "id": UUID(claims["sub"]),
        }

    except InvalidTokenError as erro:
        raise HTTPException(
            status_code=401,
            detail="Sessão inválida ou expirada.",
        ) from erro

    except (KeyError, ValueError, TypeError) as erro:
        raise HTTPException(
            status_code=401,
            detail="Não foi possível identificar o usuário autenticado.",
        ) from erro