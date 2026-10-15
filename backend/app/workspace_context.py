
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from psycopg2.extras import RealDictCursor

from app.auth import get_current_user
from app.database import get_db

# GARANTIR OS ITENS PADRÃO DE CADA ESPAÇO
def garantir_itens_padrao_workspace(cursor, workspace_id, usuario_id):
    # Busca a matriz padrão do espaço.
    cursor.execute(
        """
        SELECT id
        FROM public.matrizes
        WHERE workspace_id = %s
        AND is_padrao = TRUE
        ORDER BY created_at ASC
        LIMIT 1;
        """,
        [str(workspace_id)],
    )

    matriz = cursor.fetchone()

    # Cria a matriz padrão quando ela ainda não existe.
    if not matriz:
        cursor.execute(
            """
            INSERT INTO public.matrizes
                (nome, usuario_id, workspace_id, is_padrao)
            VALUES (%s, %s, %s, TRUE)
            RETURNING id;
            """,
            [
                "Matriz Padrão",
                str(usuario_id),
                str(workspace_id),
            ],
        )

        matriz = cursor.fetchone()

    matriz_id = matriz["id"]

    # Cria a tarefa padrão da matriz, se necessário.
    cursor.execute(
        """
        INSERT INTO public.tarefas_raci
            (matriz_id, nome, ordem, is_padrao)
        SELECT %s, 'Tarefa Padrão', 0, TRUE
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.tarefas_raci
            WHERE matriz_id = %s
            AND is_padrao = TRUE
        );
        """,
        [str(matriz_id), str(matriz_id)],
    )

    # Cria o membro padrão da matriz, se necessário.
    cursor.execute(
        """
        INSERT INTO public.membros
            (matriz_id, nome, ordem, is_padrao)
        SELECT %s, 'Membro Padrão', 0, TRUE
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.membros
            WHERE matriz_id = %s
            AND is_padrao = TRUE
        );
        """,
        [str(matriz_id), str(matriz_id)],
    )

    # Busca o cronograma padrão do espaço.
    cursor.execute(
        """
        SELECT id, matriz_id
        FROM public.cronogramas
        WHERE workspace_id = %s
        AND is_padrao = TRUE
        ORDER BY created_at ASC
        LIMIT 1;
        """,
        [str(workspace_id)],
    )

    cronograma = cursor.fetchone()

    # Cria o cronograma padrão vinculado à matriz padrão.
    if not cronograma:
        cursor.execute(
            """
            INSERT INTO public.cronogramas
                (
                    usuario_id,
                    workspace_id,
                    matriz_id,
                    nome,
                    is_padrao
                )
            VALUES (%s, %s, %s, %s, TRUE);
            """,
            [
                str(usuario_id),
                str(workspace_id),
                str(matriz_id),
                "Cronograma Padrão",
            ],
        )

    # Mantém o cronograma padrão ligado à matriz padrão.
    elif str(cronograma["matriz_id"] or "") != str(matriz_id):
        cursor.execute(
            """
            UPDATE public.cronogramas
            SET matriz_id = %s
            WHERE id = %s
            AND workspace_id = %s;
            """,
            [
                str(matriz_id),
                str(cronograma["id"]),
                str(workspace_id),
            ],
        )


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

    # Garante os itens padrão do espaço inicial.
    garantir_itens_padrao_workspace(
        cursor,
        espaco["id"],
        usuario_id,
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

    if not espaco:
        cursor.close()
        raise HTTPException(
            status_code=404,
            detail="Espaço não encontrado ou usuário sem acesso.",
        )

    # O espaço padrão já é inicializado em garantir_espaco_padrao().
    # Os demais espaços também recebem seus itens padrão ao serem acessados.
    if x_workspace_id is not None:
        garantir_itens_padrao_workspace(
            cursor,
            espaco["id"],
            espaco["owner_id"],
        )
        dados.commit()

    cursor.close()

    return dict(espaco)

