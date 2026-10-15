
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from psycopg2.extras import RealDictCursor

from app.auth import get_current_user
from app.database import get_db


def garantir_espaco_padrao(cursor, dados, usuario_id):
    """
    Garante que o usuário tenha um espaço inicial.
    Não cria matrizes nem cronogramas automaticamente.
    """

    cursor.execute(
        """
        SELECT id, nome, owner_id, is_default
        FROM public.workspaces
        WHERE owner_id = %s AND is_default = TRUE;
        """,
        [str(usuario_id)],
    )

    espaco = cursor.fetchone()

    if not espaco:
        cursor.execute(
            """
            INSERT INTO public.workspaces
                (nome, owner_id, is_default)
            VALUES (%s, %s, TRUE)
            ON CONFLICT (owner_id)
                WHERE is_default = TRUE
            DO NOTHING
            RETURNING id, nome, owner_id, is_default;
            """,
            ["Equipe do projeto", str(usuario_id)],
        )

        espaco = cursor.fetchone()

    # Outra requisição pode ter criado o espaço ao mesmo tempo.
    if not espaco:
        cursor.execute(
            """
            SELECT id, nome, owner_id, is_default
            FROM public.workspaces
            WHERE owner_id = %s AND is_default = TRUE;
            """,
            [str(usuario_id)],
        )
        espaco = cursor.fetchone()

    if not espaco:
        raise HTTPException(
            status_code=500,
            detail="Não foi possível inicializar o espaço de trabalho.",
        )

    cursor.execute(
        """
        INSERT INTO public.workspace_members
            (workspace_id, usuario_id, papel)
        VALUES (%s, %s, 'owner')
        ON CONFLICT (workspace_id, usuario_id)
        DO NOTHING;
        """,
        [str(espaco["id"]), str(usuario_id)],
    )

    dados.commit()
    return espaco


def get_current_workspace(
    x_workspace_id: UUID | None = Header(
        default=None,
        alias="X-Workspace-ID",
    ),
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    """
    Resolve o espaço selecionado no frontend.
    Sem cabeçalho, usa o espaço padrão por compatibilidade.
    """

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    if x_workspace_id is None:
        garantir_espaco_padrao(
            cursor,
            dados,
            usuario["id"],
        )

        cursor.execute(
            """
            SELECT
                w.id,
                w.nome,
                w.owner_id,
                w.is_default,
                wm.papel
            FROM public.workspaces AS w
            JOIN public.workspace_members AS wm
                ON wm.workspace_id = w.id
            WHERE w.owner_id = %s
            AND w.is_default = TRUE
            AND wm.usuario_id = %s;
            """,
            [str(usuario["id"]), str(usuario["id"])],
        )

    else:
        cursor.execute(
            """
            SELECT
                w.id,
                w.nome,
                w.owner_id,
                w.is_default,
                wm.papel
            FROM public.workspaces AS w
            JOIN public.workspace_members AS wm
                ON wm.workspace_id = w.id
            WHERE w.id = %s
            AND wm.usuario_id = %s;
            """,
            [str(x_workspace_id), str(usuario["id"])],
        )

    espaco = cursor.fetchone()
    cursor.close()

    if not espaco:
        raise HTTPException(
            status_code=404,
            detail="Espaço não encontrado ou usuário sem acesso.",
        )

    return dict(espaco)
