
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from psycopg2.extras import RealDictCursor

from app.auth import get_current_user
from app.database import get_db

router = APIRouter(prefix="/cronogramas", tags=["Cronogramas"])


class CronogramaCriacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)

class CronogramaAtualizacao(BaseModel):
    nome: str = Field(min_length=1, max_length=100)

class VinculoCronograma(BaseModel):
    matriz_id: UUID | None = None


@router.get("/")
def listar_cronogramas(dados=Depends(get_db), usuario=Depends(get_current_user)):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        """
        SELECT
            c.id,
            c.usuario_id,
            c.matriz_id,
            c.nome,
            c.is_padrao,
            m.nome AS matriz_nome,
            COALESCE(m.is_padrao, FALSE) AS matriz_is_padrao,
            c.created_at
        FROM cronogramas AS c
        LEFT JOIN matrizes AS m
            ON m.id = c.matriz_id
            AND m.usuario_id = c.usuario_id
        WHERE c.usuario_id = %s
        ORDER BY c.created_at;
        """,
        [str(usuario["id"])],
    )
    resultado = cursor.fetchall()
    cursor.close()
    return resultado


@router.post("/", status_code=201)
def criar_cronograma(
    entrada: CronogramaCriacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()
    if not nome:
        raise HTTPException(400, "Informe o nome do cronograma.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        """
        INSERT INTO cronogramas (usuario_id, matriz_id, nome)
        VALUES (%s, NULL, %s)
        RETURNING id, usuario_id, matriz_id, nome, created_at;
        """,
        [str(usuario["id"]), nome],
    )
    cronograma = cursor.fetchone()
    dados.commit()
    cursor.close()
    return cronograma

# ALTERADO: permite renomear um gráfico Gantt independente.
@router.put("/{cronograma_id}")
def atualizar_cronograma(
    cronograma_id: UUID,
    entrada: CronogramaAtualizacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(400, "Informe o nome do cronograma.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        UPDATE cronogramas
        SET nome = %s
        WHERE id = %s AND usuario_id = %s
        RETURNING id, usuario_id, matriz_id, nome, created_at;
        """,
        [nome, str(cronograma_id), str(usuario["id"])],
    )

    cronograma = cursor.fetchone()

    if not cronograma:
        cursor.close()
        raise HTTPException(404, "Gráfico não encontrado.")

    dados.commit()
    cursor.close()

    return cronograma

@router.put("/{cronograma_id}/vinculo")
def atualizar_vinculo(
    cronograma_id: UUID,
    entrada: VinculoCronograma,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)
    usuario_id = str(usuario["id"])
    matriz_destino_padrao = False

    cursor.execute(
        """
        SELECT
            c.id,
            COALESCE(m.is_padrao, FALSE) AS matriz_is_padrao
        FROM cronogramas AS c
        LEFT JOIN matrizes AS m
            ON m.id = c.matriz_id
            AND m.usuario_id = c.usuario_id
        WHERE c.id = %s AND c.usuario_id = %s;
        """,
        [str(cronograma_id), usuario_id],
    )
    cronograma_atual = cursor.fetchone()

    if not cronograma_atual:
        cursor.close()
        raise HTTPException(404, "Cronograma não encontrado.")

    if entrada.matriz_id is not None:
        cursor.execute(
            """
            SELECT id, is_padrao FROM matrizes
            WHERE id = %s AND usuario_id = %s;
            """,
            [str(entrada.matriz_id), usuario_id],
        )
        if not cursor.fetchone():
            cursor.close()
            raise HTTPException(404, "Matriz não encontrada.")

        # Cada matriz pode ter no máximo um Gantt vinculado.
        cursor.execute(
            """
            SELECT id FROM cronogramas
            WHERE matriz_id = %s
            AND usuario_id = %s
            AND id <> %s;
            """,
            [
                str(entrada.matriz_id),
                usuario_id,
                str(cronograma_id),
            ],
        )
        if cursor.fetchone():
            cursor.close()
            raise HTTPException(
                409,
                "Esta matriz já possui um cronograma vinculado.",
            )

    cursor.execute(
        """
        UPDATE cronogramas
        SET matriz_id = %s,
            is_padrao = (is_padrao OR %s)
        WHERE id = %s AND usuario_id = %s
        RETURNING id, usuario_id, matriz_id, nome, created_at, is_padrao;
        """,
        [
            str(entrada.matriz_id) if entrada.matriz_id else None,
            matriz_destino_padrao,  # #ALTERADO
            str(cronograma_id),
            usuario_id,
        ],
    )

    cronograma = cursor.fetchone()
    dados.commit()
    cursor.close()
    return cronograma


@router.delete("/{cronograma_id}", status_code=204)
def excluir_cronograma(
    cronograma_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user)
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    # #ALTERADO: identifica se o gráfico está vinculado à matriz padrão.
    cursor.execute(
        """
        SELECT
        c.is_padrao,
        COALESCE(m.is_padrao, FALSE) AS matriz_is_padrao
        FROM cronogramas AS c
        LEFT JOIN matrizes AS m
            ON m.id = c.matriz_id
            AND m.usuario_id = c.usuario_id
        WHERE c.id = %s AND c.usuario_id = %s;
        """,
        [str(cronograma_id), str(usuario["id"])]
    )

    cronograma = cursor.fetchone()

    if not cronograma:
        cursor.close()
        raise HTTPException(404, "Gráfico não encontrado.")

    # Proteção no servidor contra exclusão do Gantt padrão.
    if cronograma["is_padrao"] or cronograma["matriz_is_padrao"]:
        cursor.close()
        raise HTTPException(
            400,
            "O gráfico padrão não pode ser excluído."
        )

    cursor.execute(
        """
        DELETE FROM cronogramas
        WHERE id = %s AND usuario_id = %s
        RETURNING id;
        """,
        [str(cronograma_id), str(usuario["id"])]
    )

    cronograma_excluido = cursor.fetchone()

    if not cronograma_excluido:
        cursor.close()
        raise HTTPException(404, "Gráfico não encontrado.")

    dados.commit()
    cursor.close()

    return None

# Verifica se o gráfico existe e está independente.
def verificar_cronograma_independente(cursor, cronograma_id, usuario_id):
    cursor.execute(
        """
        SELECT id, matriz_id
        FROM cronogramas
        WHERE id = %s AND usuario_id = %s;
        """,
        [str(cronograma_id), str(usuario_id)],
    )

    cronograma = cursor.fetchone()

    if not cronograma:
        raise HTTPException(404, "Gráfico não encontrado.")

    if cronograma["matriz_id"] is not None:
        raise HTTPException(
            409,
            "Este gráfico está vinculado. Gerencie as tarefas pela matriz RACIS.",
        )

    return cronograma


# Listar tarefas de um Gantt independente.
@router.get("/{cronograma_id}/tarefas")
def listar_tarefas_gantt(
    cronograma_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_cronograma_independente(
        cursor, cronograma_id, usuario["id"]
    )

    cursor.execute(
        """
        SELECT id, cronograma_id, nome, data_inicio, data_fim,
        status, ordem, is_padrao, created_at
        FROM tarefas_cronograma
        WHERE cronograma_id = %s
        ORDER BY ordem, created_at;
        """,
        [str(cronograma_id)],
    )

    tarefas = cursor.fetchall()
    cursor.close()
    return tarefas


# Criar tarefa de Gantt independente.
@router.post("/{cronograma_id}/tarefas", status_code=201)
def criar_tarefa_gantt(
    cronograma_id: UUID,
    entrada: CronogramaAtualizacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(400, "Informe o nome da tarefa.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_cronograma_independente(
        cursor, cronograma_id, usuario["id"]
    )

    cursor.execute(
        """
        SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima
        FROM tarefas_cronograma
        WHERE cronograma_id = %s;
        """,
        [str(cronograma_id)],
    )
    ordem = cursor.fetchone()["proxima"]

    cursor.execute(
        """
        INSERT INTO tarefas_cronograma
            (cronograma_id, nome, ordem, is_padrao)
        VALUES (%s, %s, %s, FALSE)
        RETURNING id, cronograma_id, nome, data_inicio, data_fim,
        status, ordem, is_padrao, created_at;
        """,
        [str(cronograma_id), nome, ordem],
    )

    tarefa = cursor.fetchone()
    dados.commit()
    cursor.close()
    return tarefa


# Renomear uma tarefa de Gantt independente.
@router.put("/{cronograma_id}/tarefas/{tarefa_id}")
def renomear_tarefa_gantt(
    cronograma_id: UUID,
    tarefa_id: UUID,
    entrada: CronogramaAtualizacao,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    nome = entrada.nome.strip()

    if not nome:
        raise HTTPException(400, "Informe o nome da tarefa.")

    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_cronograma_independente(
        cursor, cronograma_id, usuario["id"]
    )

    cursor.execute(
        """
        UPDATE tarefas_cronograma
        SET nome = %s
        WHERE id = %s AND cronograma_id = %s
        RETURNING id, cronograma_id, nome, data_inicio, data_fim,
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


# Excluir tarefa de Gantt independente, exceto padrão.
@router.delete("/{cronograma_id}/tarefas/{tarefa_id}", status_code=204)
def excluir_tarefa_gantt(
    cronograma_id: UUID,
    tarefa_id: UUID,
    dados=Depends(get_db),
    usuario=Depends(get_current_user),
):
    cursor = dados.cursor(cursor_factory=RealDictCursor)

    verificar_cronograma_independente(
        cursor, cronograma_id, usuario["id"]
    )

    cursor.execute(
        """
        SELECT is_padrao
        FROM tarefas_cronograma
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
        DELETE FROM tarefas_cronograma
        WHERE id = %s AND cronograma_id = %s;
        """,
        [str(tarefa_id), str(cronograma_id)],
    )

    dados.commit()
    cursor.close()
    return None