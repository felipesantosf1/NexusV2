
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Carrega as variáveis de ambiente do backend.
load_dotenv()

# Permite receber o token enviado no cabeçalho Authorization.
esquema_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credenciais: HTTPAuthorizationCredentials | None = Depends(
        esquema_bearer
    )
):
    # Sem token, o usuário não está autenticado.
    if credenciais is None:
        raise HTTPException(
            status_code=401,
            detail="Autenticação necessária."
        )

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY")

    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=500,
            detail="Configuração do Supabase ausente no backend."
        )

    # Consulta o Supabase Auth para validar o token e identificar
    # o usuário ao qual ele pertence.
    requisicao = Request(
        url=f"{supabase_url.rstrip('/')}/auth/v1/user",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {credenciais.credentials}"
        },
        method="GET"
    )

    try:
        with urlopen(requisicao, timeout=10) as resposta:
            usuario = json.loads(resposta.read().decode("utf-8"))

    except HTTPError as erro:
        if erro.code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Sessão inválida ou expirada."
            ) from erro

        raise HTTPException(
            status_code=503,
            detail="Não foi possível validar a sessão."
        ) from erro

    except (URLError, TimeoutError) as erro:
        raise HTTPException(
            status_code=503,
            detail="Serviço de autenticação indisponível."
        ) from erro

    try:
        usuario_id = UUID(usuario["id"])
    except (KeyError, ValueError, TypeError) as erro:
        raise HTTPException(
            status_code=401,
            detail="Não foi possível identificar o usuário."
        ) from erro

    return {"id": usuario_id}
