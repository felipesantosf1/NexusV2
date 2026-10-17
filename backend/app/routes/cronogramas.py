
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor

from app.auth import get_current_user
from app.database import get_db
from app.workspace_context import get_current_workspace, exigir_edicao


router = APIRouter(prefix="/cronogramas", tags=["Cronogramas"])


class CronogramaCriacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


class CronogramaAtualizacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)


class PlanejamentoTarefaAtualizacao(BaseModel):
    data_inicio: date | None = None
    data_fim: date | None = None
    status: Literal["pending", "in_progress", "done"] = "pending"


class VinculoCronograma(BaseModel):
    matriz_id: UUID | None = None


# Lista somente os cronogramas do espaço atual.
@router.get("/")
def listar_cronogramas(
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT
            c.id,
            c.usuario_id,
            c.workspace_id,
            c.matriz_id,
            c.nome,
            c.is_padrao,
            m.nome AS matriz_nome,
            COALESCE(m.is_padrao, FALSE) AS matriz_is_padrao,
            c.created_at
        FROM public.cronogramas AS c
        LEFT JOIN public.matrizes AS m
            ON m.id = c.matriz_id
            AND m.workspace_id = c.workspace_id
        WHERE c.workspace_id = %s
        ORDER BY c.created_at;
        """,
        [str(workspace["id"])],
    )

    resultado = cursor.fetchall()
    cursor.close()
    return resultado


# Cria um cronograma independente no espaço atual.
@router.post("/", status_code=201)
def criar_cronograma(
    entrada: CronogramaCriacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
    workspace=Depends(get_current_workspace),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(400, "Informe o nome do cronograma.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        INSERT INTO public.cronogramas
            (usuario_id, workspace_id, matriz_id, nome)
        VALUES (%s, %s, NULL, %s)
        RETURNING
            id, usuario_id, workspace_id, matriz_id,
            nome, is_padrao, created_at;
        """,
        [str(usuario["id"]), str(workspace["id"]), nome],
    )

    cronograma = cursor.fetchone()
    dados.commit()
    cursor.close()
    return cronograma


# Renomeia um cronograma do espaço atual.
@router.put("/{cronograma_id}")
def atualizar_cronograma(
    cronograma_id: UUID,
    entrada: CronogramaAtualizacao,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(400, "Informe o nome do cronograma.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        UPDATE public.cronogramas
        SET nome = %s
        WHERE id = %s AND workspace_id = %s
        RETURNING
            id, usuario_id, workspace_id, matriz_id,
            nome, is_padrao, created_at;
        """,
        [nome, str(cronograma_id), str(workspace["id"])],
    )

    cronograma = cursor.fetchone()

    if not cronograma:
        cursor.close()
        raise HTTPException(404, "Gráfico não encontrado neste espaço.")

    dados.commit()
    cursor.close()
    return cronograma


# Vincula ou desvincula um cronograma de uma matriz do mesmo espaço.
@router.put("/{cronograma_id}/vinculo")
def atualizar_vinculo(
    cronograma_id: UUID,
    entrada: VinculoCronograma,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    workspace_id = str(workspace["id"])
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT id, matriz_id, is_padrao
        FROM public.cronogramas
        WHERE id = %s AND workspace_id = %s;
        """,
        [str(cronograma_id), workspace_id],
    )

    cronograma = cursor.fetchone()

    if not cronograma:
        cursor.close()
        raise HTTPException(404, "Cronograma não encontrado neste espaço.")

    if entrada.matriz_id is not None:
        cursor.execute(
            """
            SELECT id
            FROM public.matrizes
            WHERE id = %s AND workspace_id = %s;
            """,
            [str(entrada.matriz_id), workspace_id],
        )

        if not cursor.fetchone():
            cursor.close()
            raise HTTPException(
                404,
                "Matriz não encontrada neste espaço de trabalho.",
            )

        # Impede que a mesma matriz seja vinculada a dois cronogramas.
        cursor.execute(
            """
            SELECT id
            FROM public.cronogramas
            WHERE matriz_id = %s
            AND workspace_id = %s
            AND id <> %s;
            """,
            [str(entrada.matriz_id), workspace_id, str(cronograma_id)],
        )

        if cursor.fetchone():
            cursor.close()
            raise HTTPException(
                409,
                "Esta matriz já possui um cronograma vinculado.",
            )

    cursor.execute(
        """
        UPDATE public.cronogramas
        SET matriz_id = %s
        WHERE id = %s AND workspace_id = %s
        RETURNING
            id, usuario_id, workspace_id, matriz_id,
            nome, is_padrao, created_at;
        """,
        [
            str(entrada.matriz_id) if entrada.matriz_id else None,
            str(cronograma_id),
            workspace_id,
        ],
    )

    resultado = cursor.fetchone()
    dados.commit()
    cursor.close()
    return resultado


# Exclui somente cronogramas não protegidos do espaço atual.
@router.delete("/{cronograma_id}", status_code=204)
def excluir_cronograma(
    cronograma_id: UUID,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    workspace_id = str(workspace["id"])
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT
            c.is_padrao,
            COALESCE(m.is_padrao, FALSE) AS matriz_is_padrao
        FROM public.cronogramas AS c
        LEFT JOIN public.matrizes AS m
            ON m.id = c.matriz_id
            AND m.workspace_id = c.workspace_id
        WHERE c.id = %s AND c.workspace_id = %s;
        """,
        [str(cronograma_id), workspace_id],
    )

    cronograma = cursor.fetchone()

    if not cronograma:
        cursor.close()
        raise HTTPException(404, "Gráfico não encontrado neste espaço.")

    if cronograma["is_padrao"] or cronograma["matriz_is_padrao"]:
        cursor.close()
        raise HTTPException(400, "O gráfico padrão não pode ser excluído.")

    cursor.execute(
        """
        DELETE FROM public.cronogramas
        WHERE id = %s AND workspace_id = %s
        RETURNING id;
        """,
        [str(cronograma_id), workspace_id],
    )

    if not cursor.fetchone():
        cursor.close()
        raise HTTPException(404, "Gráfico não encontrado neste espaço.")

    dados.commit()
    cursor.close()
    return None


# Verifica se o cronograma existe e é independente no espaço atual.
def verificar_cronograma_independente(cursor, cronograma_id, workspace_id):
    cursor.execute(
        """
        SELECT id, workspace_id, matriz_id
        FROM public.cronogramas
        WHERE id = %s AND workspace_id = %s;
        """,
        [str(cronograma_id), str(workspace_id)],
    )

    cronograma = cursor.fetchone()

    if not cronograma:
        raise HTTPException(
            404,
            "Gráfico não encontrado neste espaço de trabalho.",
        )

    if cronograma["matriz_id"] is not None:
        raise HTTPException(
            409,
            "Este gráfico está vinculado. Gerencie as tarefas pela matriz RACIS.",
        )

    return cronograma


# Lista as tarefas de um cronograma independente.
@router.get("/{cronograma_id}/tarefas")
def listar_tarefas_gantt(
    cronograma_id: UUID,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_cronograma_independente(
        cursor, cronograma_id, workspace["id"]
    )

    cursor.execute(
        """
        SELECT
            id, cronograma_id, nome, data_inicio, data_fim,
            status, ordem, is_padrao, created_at
        FROM public.tarefas_cronograma
        WHERE cronograma_id = %s
        ORDER BY ordem, created_at;
        """,
        [str(cronograma_id)],
    )

    tarefas = cursor.fetchall()
    cursor.close()
    return tarefas


# Cria uma tarefa no cronograma independente.
@router.post("/{cronograma_id}/tarefas", status_code=201)
def criar_tarefa_gantt(
    cronograma_id: UUID,
    entrada: CronogramaAtualizacao,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(400, "Informe o nome da tarefa.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_cronograma_independente(
        cursor, cronograma_id, workspace["id"]
    )

    cursor.execute(
        """
        SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima
        FROM public.tarefas_cronograma
        WHERE cronograma_id = %s;
        """,
        [str(cronograma_id)],
    )

    ordem = cursor.fetchone()["proxima"]

    cursor.execute(
        """
        INSERT INTO public.tarefas_cronograma
            (cronograma_id, nome, ordem, is_padrao)
        VALUES (%s, %s, %s, FALSE)
        RETURNING
            id, cronograma_id, nome, data_inicio, data_fim,
            status, ordem, is_padrao, created_at;
        """,
        [str(cronograma_id), nome, ordem],
    )

    tarefa = cursor.fetchone()
    dados.commit()
    cursor.close()
    return tarefa


# Renomeia uma tarefa de um cronograma independente.
@router.put("/{cronograma_id}/tarefas/{tarefa_id}")
def renomear_tarefa_gantt(
    cronograma_id: UUID,
    tarefa_id: UUID,
    entrada: CronogramaAtualizacao,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(400, "Informe o nome da tarefa.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_cronograma_independente(
        cursor, cronograma_id, workspace["id"]
    )

    cursor.execute(
        """
        UPDATE public.tarefas_cronograma
        SET nome = %s
        WHERE id = %s AND cronograma_id = %s
        RETURNING
            id, cronograma_id, nome, data_inicio, data_fim,
            status, ordem, is_padrao, created_at;
        """,
        [nome, str(tarefa_id), str(cronograma_id)],
    )

    tarefa = cursor.fetchone()

    if not tarefa:
        cursor.close()
        raise HTTPException(404, "Tarefa não encontrada.")

    dados.commit()
    cursor.close()
    return tarefa


# Exclui tarefas independentes, exceto a tarefa padrão.
@router.delete(
    "/{cronograma_id}/tarefas/{tarefa_id}",
    status_code=204,
)
def excluir_tarefa_gantt(
    cronograma_id: UUID,
    tarefa_id: UUID,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_cronograma_independente(
        cursor, cronograma_id, workspace["id"]
    )

    cursor.execute(
        """
        SELECT is_padrao
        FROM public.tarefas_cronograma
        WHERE id = %s AND cronograma_id = %s;
        """,
        [str(tarefa_id), str(cronograma_id)],
    )

    tarefa = cursor.fetchone()

    if not tarefa:
        cursor.close()
        raise HTTPException(404, "Tarefa não encontrada.")

    if tarefa["is_padrao"]:
        cursor.close()
        raise HTTPException(400, "A tarefa padrão não pode ser excluída.")

    cursor.execute(
        """
        DELETE FROM public.tarefas_cronograma
        WHERE id = %s AND cronograma_id = %s;
        """,
        [str(tarefa_id), str(cronograma_id)],
    )

    dados.commit()
    cursor.close()
    return None


# Atualiza datas e status de uma tarefa independente.
@router.patch(
    "/{cronograma_id}/tarefas/{tarefa_id}/planejamento"
)
def atualizar_planejamento_gantt(
    cronograma_id: UUID,
    tarefa_id: UUID,
    entrada: PlanejamentoTarefaAtualizacao,
    dados=Depends(get_db),
    workspace=Depends(get_current_workspace),
):
    if (entrada.data_inicio is None) != (entrada.data_fim is None):
        raise HTTPException(
            400,
            "Preencha as duas datas ou deixe ambas vazias.",
        )

    if (
        entrada.data_inicio is not None
        and entrada.data_fim < entrada.data_inicio
    ):
        raise HTTPException(
            400,
            "A data final deve ser igual ou posterior à data inicial.",
        )

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_cronograma_independente(
        cursor, cronograma_id, workspace["id"]
    )

    cursor.execute(
        """
        UPDATE public.tarefas_cronograma
        SET data_inicio = %s,
            data_fim = %s,
            status = %s
        WHERE id = %s AND cronograma_id = %s
        RETURNING
            id, cronograma_id, nome, data_inicio, data_fim,
            status, ordem, is_padrao, created_at;
        """,
        [
            entrada.data_inicio,
            entrada.data_fim,
            entrada.status,
            str(tarefa_id),
            str(cronograma_id),
        ],
    )

    tarefa = cursor.fetchone()

    if not tarefa:
        cursor.close()
        raise HTTPException(404, "Tarefa não encontrada.")

    dados.commit()
    cursor.close()
    return tarefa
