
import hashlib
import secrets
from uuid import UUID
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor

from app.auth import get_current_user
from app.database import get_db
from app.workspace_context import (garantir_espaco_padrao, garantir_itens_padrao_workspace)


router = APIRouter(prefix="/workspaces", tags=["Espaços de trabalho"])


class WorkspaceCriacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


class WorkspaceAtualizacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)

class WorkspacePapelAtualizacao(BaseModel):
    papel: Literal["owner", "editor", "viewer"]

def obter_papel(cursor, workspace_id, usuario_id):
    cursor.execute(
        """
        SELECT papel
        FROM public.workspace_members
        WHERE workspace_id = %s
        AND usuario_id = %s;
        """,
        [str(workspace_id), str(usuario_id)],
    )

    membro = cursor.fetchone()

    if not membro:
        raise HTTPException(
            status_code=404,
            detail="Espaço não encontrado ou usuário sem acesso.",
        )

    return membro["papel"]


def exigir_administrador(cursor, workspace_id, usuario_id):
    papel = obter_papel(cursor, workspace_id, usuario_id)

    if papel != "owner":
        raise HTTPException(
            status_code=403,
            detail="Somente proprietários podem administrar este espaço.",
        )


# Listar os espaços dos quais o usuário participa.
@router.get("/")
def listar_workspaces(
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    garantir_espaco_padrao(cursor, dados, usuario["id"])

    cursor.execute(
        """
        SELECT
            w.id,
            w.nome,
            w.owner_id,
            w.is_default,
            w.created_at,
            wm.papel
        FROM public.workspaces AS w
        JOIN public.workspace_members AS wm
            ON wm.workspace_id = w.id
        WHERE wm.usuario_id = %s
        ORDER BY w.is_default DESC, w.created_at ASC;
        """,
        [str(usuario["id"])],
    )

    resultado = cursor.fetchall()
    cursor.close()

    return resultado


# Criar um espaço de trabalho.
@router.post("/", status_code=201)
def criar_workspace(
    entrada: WorkspaceCriacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(
            status_code=400,
            detail="Informe o nome do espaço de trabalho.",
        )

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        INSERT INTO public.workspaces
            (nome, owner_id, is_default)
        VALUES (%s, %s, FALSE)
        RETURNING id, nome, owner_id, is_default, created_at;
        """,
        [nome, str(usuario["id"])],
    )

    espaco = cursor.fetchone()

    cursor.execute(
        """
        INSERT INTO public.workspace_members
            (workspace_id, usuario_id, papel)
        VALUES (%s, %s, 'owner');
        """,
        [str(espaco["id"]), str(usuario["id"])],
    )

    # Cria os itens padrão do novo espaço.
    garantir_itens_padrao_workspace(
        cursor,
        espaco["id"],
        usuario["id"],
    )

    dados.commit()
    cursor.close()

    espaco["papel"] = "owner"
    return espaco


# Renomear um espaço.
@router.put("/{workspace_id}")
def renomear_workspace(
    workspace_id: UUID,
    entrada: WorkspaceAtualizacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(
            status_code=400,
            detail="Informe o nome do espaço de trabalho.",
        )

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    exigir_administrador(
        cursor,
        workspace_id,
        usuario["id"],
    )

    cursor.execute(
        """
        UPDATE public.workspaces
        SET nome = %s
        WHERE id = %s
        RETURNING id, nome, owner_id, is_default, created_at;
        """,
        [nome, str(workspace_id)],
    )

    espaco = cursor.fetchone()

    dados.commit()
    cursor.close()

    return espaco


# EXCLUIR UM ESPAÇO DE TRABALHO
@router.delete("/{workspace_id}", status_code=204)
def excluir_workspace(
    workspace_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT
            w.owner_id,
            w.is_default,
            wm.papel
        FROM public.workspaces AS w
        JOIN public.workspace_members AS wm
            ON wm.workspace_id = w.id
        WHERE w.id = %s
        AND wm.usuario_id = %s
        FOR UPDATE OF w;
        """,
        [str(workspace_id), str(usuario["id"])],
    )

    workspace = cursor.fetchone()

    if not workspace:
        cursor.close()
        raise HTTPException(
            status_code=404,
            detail="Espaço de trabalho não encontrado.",
        )

    # Somente o proprietário pode excluir o espaço.
    if workspace["papel"] != "owner":
        cursor.close()
        raise HTTPException(
            status_code=403,
            detail="Somente proprietários podem excluir este espaço.",
        )

    # O espaço padrão é necessário para a inicialização da conta.
    if workspace["is_default"]:
        cursor.close()
        raise HTTPException(
            status_code=400,
            detail="O espaço de trabalho padrão não pode ser excluído.",
        )

    workspace_id_str = str(workspace_id)

    try:
        # Remove os convites do espaço.
        cursor.execute(
            """
            DELETE FROM public.workspace_invites
            WHERE workspace_id = %s;
            """,
            [workspace_id_str],
        )

        # Remove as atribuições, tarefas e membros das matrizes.
        cursor.execute(
            """
            DELETE FROM public.atribuicoes_raci
            WHERE matriz_id IN (
                SELECT id FROM public.matrizes
                WHERE workspace_id = %s
            );
            """,
            [workspace_id_str],
        )

        cursor.execute(
            """
            DELETE FROM public.tarefas_raci
            WHERE matriz_id IN (
                SELECT id FROM public.matrizes
                WHERE workspace_id = %s
            );
            """,
            [workspace_id_str],
        )

        cursor.execute(
            """
            DELETE FROM public.membros
            WHERE matriz_id IN (
                SELECT id FROM public.matrizes
                WHERE workspace_id = %s
            );
            """,
            [workspace_id_str],
        )

        # Remove as tarefas dos cronogramas independentes.
        cursor.execute(
            """
            DELETE FROM public.tarefas_cronograma
            WHERE cronograma_id IN (
                SELECT id FROM public.cronogramas
                WHERE workspace_id = %s
            );
            """,
            [workspace_id_str],
        )

        # Remove os cronogramas antes das matrizes vinculadas.
        cursor.execute(
            """
            DELETE FROM public.cronogramas
            WHERE workspace_id = %s;
            """,
            [workspace_id_str],
        )

        cursor.execute(
            """
            DELETE FROM public.matrizes
            WHERE workspace_id = %s;
            """,
            [workspace_id_str],
        )

        cursor.execute(
            """
            DELETE FROM public.workspace_members
            WHERE workspace_id = %s;
            """,
            [workspace_id_str],
        )

        cursor.execute(
            """
            DELETE FROM public.workspaces
            WHERE id = %s;
            """,
            [workspace_id_str],
        )

        dados.commit()

    except Exception:
        dados.rollback()
        raise

    finally:
        cursor.close()

    return None


# Consultar integrantes de um espaço.
@router.get("/{workspace_id}/members")
def listar_integrantes(
    workspace_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    obter_papel(cursor, workspace_id, usuario["id"])

    cursor.execute(
        """
        SELECT
            wm.usuario_id,
            wm.papel,
            wm.created_at,
            u.email,  
        COALESCE(
            NULLIF(u.raw_user_meta_data->>'full_name', ''),
            NULLIF(u.raw_user_meta_data->>'name', ''),
            NULLIF(u.raw_user_meta_data->>'username', ''),
            split_part(u.email, '@', 1)
        ) AS nome
        FROM public.workspace_members AS wm
        JOIN auth.users AS u
            ON u.id = wm.usuario_id
        WHERE wm.workspace_id = %s
        ORDER BY
            CASE wm.papel
                WHEN 'owner' THEN 0
                WHEN 'admin' THEN 1
                ELSE 2
            END,
            wm.created_at ASC;
        """,
        [str(workspace_id)],
    )

    membros = cursor.fetchall()
    cursor.close()

    return membros

# Alterar a permissão de um integrante.
@router.put("/{workspace_id}/members/{usuario_id}/role")
def alterar_papel_integrante(
    workspace_id: UUID,
    usuario_id: UUID,
    entrada: WorkspacePapelAtualizacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    # Bloqueia alterações concorrentes nas permissões do mesmo espaço.
    cursor.execute(
        """
        SELECT owner_id
        FROM public.workspaces
        WHERE id = %s
        FOR UPDATE;
        """,
        [str(workspace_id)],
    )

    workspace = cursor.fetchone()

    if not workspace:
        cursor.close()
        raise HTTPException(404, "Espaço de trabalho não encontrado.")

    papel_solicitante = obter_papel(
        cursor,
        workspace_id,
        usuario["id"],
    )

    if papel_solicitante != "owner":
        cursor.close()
        raise HTTPException(
            status_code=403,
            detail="Somente proprietários podem alterar permissões.",
        )

    if str(usuario_id) == str(usuario["id"]):
        cursor.close()
        raise HTTPException(
            status_code=400,
            detail="Você não pode alterar sua própria permissão.",
        )

    cursor.execute(
        """
        SELECT papel
        FROM public.workspace_members
        WHERE workspace_id = %s
        AND usuario_id = %s
        FOR UPDATE;
        """,
        [str(workspace_id), str(usuario_id)],
    )

    integrante = cursor.fetchone()

    if not integrante:
        cursor.close()
        raise HTTPException(
            status_code=404,
            detail="Integrante não encontrado neste espaço.",
        )

    novo_papel = entrada.papel

    # O proprietário principal não pode ser rebaixado.
    if (
        str(usuario_id) == str(workspace["owner_id"])
        and novo_papel != "owner"
    ):
        cursor.close()
        raise HTTPException(
            status_code=400,
            detail="O proprietário principal não pode ser rebaixado.",
        )

    # Não permite rebaixar o último proprietário restante.
    if (
        integrante["papel"] == "owner"
        and novo_papel != "owner"
    ):
        cursor.execute(
            """
            SELECT COUNT(*) AS total
            FROM public.workspace_members
            WHERE workspace_id = %s
            AND papel = 'owner'
            AND usuario_id <> %s;
            """,
            [str(workspace_id), str(usuario_id)],
        )

        outros_proprietarios = cursor.fetchone()["total"]

        if outros_proprietarios == 0:
            cursor.close()
            raise HTTPException(
                status_code=400,
                detail="O espaço precisa manter pelo menos um proprietário.",
            )

    cursor.execute(
        """
        UPDATE public.workspace_members
        SET papel = %s
        WHERE workspace_id = %s
        AND usuario_id = %s
        RETURNING usuario_id, papel;
        """,
        [novo_papel, str(workspace_id), str(usuario_id)],
    )

    resultado = cursor.fetchone()
    dados.commit()
    cursor.close()

    return resultado

# Remover um integrante do espaço de trabalho.
@router.delete(
    "/{workspace_id}/members/{usuario_id}",
    status_code=204,
)
def remover_integrante(
    workspace_id: UUID,
    usuario_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    # Somente proprietários e administradores podem remover integrantes.
    papel_solicitante = obter_papel(
        cursor,
        workspace_id,
        usuario["id"],
    )

    if papel_solicitante != "owner":
        cursor.close()
        raise HTTPException(
            status_code=403,
            detail="Você não tem permissão para remover integrantes.",
        )

    # Busca o integrante e verifica se ele é o proprietário.
    cursor.execute(
        """
        SELECT
            wm.papel,
            w.owner_id
        FROM public.workspace_members AS wm
        JOIN public.workspaces AS w
            ON w.id = wm.workspace_id
        WHERE wm.workspace_id = %s
        AND wm.usuario_id = %s
        FOR UPDATE OF wm;
        """,
        [str(workspace_id), str(usuario_id)],
    )

    integrante = cursor.fetchone()

    if not integrante:
        cursor.close()
        raise HTTPException(
            status_code=404,
            detail="Integrante não encontrado neste espaço.",
        )

    # Impede remover a própria conta por esta função.
    if str(usuario_id) == str(usuario["id"]):
        cursor.close()
        raise HTTPException(
            status_code=400,
            detail="Você não pode remover sua própria conta por esta opção.",
        )

    # O proprietário do espaço nunca pode ser removido por esta rota.
    if (
        integrante["papel"] == "owner"
        or str(integrante["owner_id"]) == str(usuario_id)
    ):
        cursor.close()
        raise HTTPException(
            status_code=400,
            detail="O proprietário do espaço não pode ser removido.",
        )

    # Um administrador não pode remover outro administrador.
    if (
        integrante["papel"] == "admin"
        and papel_solicitante != "owner"
    ):
        cursor.close()
        raise HTTPException(
            status_code=403,
            detail="Somente o proprietário pode remover outro administrador.",
        )

    cursor.execute(
        """
        DELETE FROM public.workspace_members
        WHERE workspace_id = %s
        AND usuario_id = %s;
        """,
        [str(workspace_id), str(usuario_id)],
    )

    dados.commit()
    cursor.close()

    return None

# Criar um convite de uso único, válido por sete dias.
@router.post("/{workspace_id}/invites", status_code=201)
def criar_convite(
    workspace_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    exigir_administrador(
        cursor,
        workspace_id,
        usuario["id"],
    )

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    cursor.execute(
        """
        INSERT INTO public.workspace_invites
            (workspace_id, criado_por, token_hash, expira_em)
        VALUES (
            %s,
            %s,
            %s,
            NOW() + INTERVAL '7 days'
        )
        RETURNING id, workspace_id, expira_em, created_at;
        """,
        [
            str(workspace_id),
            str(usuario["id"]),
            token_hash,
        ],
    )

    convite = cursor.fetchone()

    dados.commit()
    cursor.close()

    # O token original só é devolvido nesta resposta.
    convite["token"] = token
    return convite


# Aceitar convite após o usuário entrar na conta.
@router.post("/invites/{token}/accept")
def aceitar_convite(
    token: str,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT
            id,
            workspace_id
        FROM public.workspace_invites
        WHERE token_hash = %s
        AND expira_em > NOW()
        AND aceito_em IS NULL
        FOR UPDATE;
        """,
        [token_hash],
    )

    convite = cursor.fetchone()

    if not convite:
        cursor.close()
        raise HTTPException(
            status_code=404,
            detail="Convite inválido, expirado ou já utilizado.",
        )

    cursor.execute(
        """
        INSERT INTO public.workspace_members
            (workspace_id, usuario_id, papel)
        VALUES (%s, %s, 'editor')
        ON CONFLICT (workspace_id, usuario_id)
        DO NOTHING;
        """,
        [
            str(convite["workspace_id"]),
            str(usuario["id"]),
        ],
    )

    cursor.execute(
        """
        UPDATE public.workspace_invites
        SET aceito_por = %s,
            aceito_em = NOW()
        WHERE id = %s;
        """,
        [
            str(usuario["id"]),
            str(convite["id"]),
        ],
    )

    cursor.execute(
        """
        SELECT id, nome, owner_id, is_default, created_at
        FROM public.workspaces
        WHERE id = %s;
        """,
        [str(convite["workspace_id"])],
    )

    espaco = cursor.fetchone()

    dados.commit()
    cursor.close()

    return {
        "mensagem": "Você entrou no espaço de trabalho.",
        "workspace": espaco,
    }
