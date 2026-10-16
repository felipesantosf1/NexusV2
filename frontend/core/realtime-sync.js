// Sincronização automática entre integrantes do NexusPM.
(() => {
    "use strict";

    const INTERVALO_MS = 8000;

    let emExecucao = false;
    let workspaceObservado = null;

    const assinaturasRaci = new Map();
    const assinaturasGantt = new Map();

    function assinaturaMembros(lista) {
        return JSON.stringify(
            (lista || [])
                .map(m => ({
                    id: String(m.usuario_id),
                    nome: m.nome || "",
                    email: m.email || "",
                    papel: m.papel || ""
                }))
                .sort((a, b) => a.id.localeCompare(b.id))
        );
    }

    function assinaturaMatrizes(lista) {
        return JSON.stringify(
            (lista || [])
                .map(m => ({
                    id: String(m.id),
                    nome: m.nome || "",
                    padrao: Boolean(m.is_padrao)
                }))
                .sort((a, b) => a.id.localeCompare(b.id))
        );
    }

    function assinaturaCronogramas(lista) {
        return JSON.stringify(
            (lista || [])
                .map(c => ({
                    id: String(c.id),
                    nome: c.nome || "",
                    matriz: c.matriz_id ? String(c.matriz_id) : null,
                    padrao: Boolean(c.is_padrao),
                    matriz_nome: c.matriz_nome || null
                }))
                .sort((a, b) => a.id.localeCompare(b.id))
        );
    }

    function assinaturaRaci(dados) {
        return JSON.stringify({
            tarefas: (dados?.tarefas || [])
                .map(t => ({
                    id: String(t.id),
                    nome: t.nome || "",
                    ordem: Number(t.ordem || 0),
                    inicio: t.data_inicio || null,
                    fim: t.data_fim || null,
                    status: t.status || "pending",
                    padrao: Boolean(t.is_padrao)
                }))
                .sort((a, b) => a.id.localeCompare(b.id)),

            membros: (dados?.membros || [])
                .map(m => ({
                    id: String(m.id),
                    nome: m.nome || "",
                    ordem: Number(m.ordem || 0),
                    padrao: Boolean(m.is_padrao)
                }))
                .sort((a, b) => a.id.localeCompare(b.id)),

            atribuicoes: (dados?.atribuicoes || [])
                .map(a => ({
                    tarefa: String(a.tarefa_id),
                    membro: String(a.membro_id),
                    papel: a.papel || ""
                }))
                .sort((a, b) =>
                    a.tarefa.localeCompare(b.tarefa) ||
                    a.membro.localeCompare(b.membro)
                )
        });
    }

    function assinaturaTarefasGantt(lista) {
        return JSON.stringify(
            (lista || [])
                .map(t => ({
                    id: String(t.id),
                    nome: t.nome || "",
                    inicio: t.data_inicio || null,
                    fim: t.data_fim || null,
                    status: t.status || "pending",
                    ordem: Number(t.ordem || 0),
                    padrao: Boolean(t.is_padrao)
                }))
                .sort((a, b) => a.id.localeCompare(b.id))
        );
    }

    function assinaturaOpcoesMatrizes() {
        return assinaturaMatrizes(
            [...seletorMatriz.options].map(opcao => ({
                id: opcao.value,
                nome: opcao.textContent,
                is_padrao: opcao.dataset.isPadrao === "true"
            }))
        );
    }

    function existeEdicaoEmAndamento() {
        return Boolean(
            document.querySelector(
                ".raci-inline-edit, " +
                "#nexus-dialog-overlay:not([hidden]), " +
                "#workspaceInviteOverlay:not([hidden]), " +
                "#menu-raci:not(.hidden), " +
                "[data-sync-pendente='true']"
            ) ||
            document.activeElement?.matches(
                "input, textarea, [contenteditable='true']"
            ) ||
            dadosRaci.tarefas.some(t => t._pendente)
        );
    }

    async function sincronizar() {
        if (
            emExecucao ||
            !workspaceAtualId ||
            document.visibilityState === "hidden" ||
            existeEdicaoEmAndamento()
        ) {
            return;
        }

        emExecucao = true;
        const workspaceId = String(workspaceAtualId);

        try {
            if (workspaceObservado !== workspaceId) {
                workspaceObservado = workspaceId;
                assinaturasRaci.clear();
                assinaturasGantt.clear();
            }

            // 1. Integrantes do espaço e avatares no topo.
            const membrosNovos = await requisicaoApi(
                `/workspaces/${workspaceId}/members`
            );

            if (String(workspaceAtualId) !== workspaceId) return;

            if (
                assinaturaMembros(membrosNovos) !==
                assinaturaMembros(membrosWorkspace)
            ) {
                membrosWorkspace = membrosNovos;
                renderizarMembrosWorkspace();
                atualizarCabecalhoWorkspace();
            }

            // 2. Matrizes criadas, removidas ou renomeadas.
            const matrizesNovas = await requisicaoApi("/matrizes/");

            if (String(workspaceAtualId) !== workspaceId) return;

            if (
                assinaturaMatrizes(matrizesNovas) !==
                assinaturaOpcoesMatrizes()
            ) {
                await carregarMatrizes(matrizAtualId);
            }

            if (String(workspaceAtualId) !== workspaceId) return;

            // 3. Cronogramas e respectivos vínculos.
            const cronogramasNovos = await requisicaoApi("/cronogramas/");

            if (String(workspaceAtualId) !== workspaceId) return;

            if (
                assinaturaCronogramas(cronogramasNovos) !==
                assinaturaCronogramas(cronogramasUsuario)
            ) {
                await atualizarEstadoMenuMatriz();
                await renderizarGanttVinculado();
            }

            if (String(workspaceAtualId) !== workspaceId) return;

            // 4. Matriz RACIS aberta.
            const matrizId = matrizAtualId
                ? String(matrizAtualId)
                : null;

            if (matrizId) {
                const raciNovo = await requisicaoApi(
                    `/matrizes/${matrizId}/raci`
                );

                if (
                    String(workspaceAtualId) !== workspaceId ||
                    String(matrizAtualId) !== matrizId
                ) {
                    return;
                }

                const assinaturaNova = assinaturaRaci(raciNovo);
                const assinaturaAtual = assinaturaRaci(dadosRaci);

                if (assinaturaNova !== assinaturaAtual) {
                    dadosRaci = raciNovo;
                    renderizarRaci();

                    const seletorGantt =
                        document.getElementById("ganttSelect");

                    const ganttAtual = cronogramasUsuario.find(
                        c => String(c.id) ===
                            String(seletorGantt.value)
                    );

                    if (
                        ganttAtual?.matriz_id &&
                        String(ganttAtual.matriz_id) === matrizId
                    ) {
                        await renderizarGanttVinculado();
                    }
                }

                assinaturasRaci.set(matrizId, assinaturaNova);
            }

            if (String(workspaceAtualId) !== workspaceId) return;

            // 5. Atualizações em outra matriz ligada ao Gantt selecionado.
            const seletorGantt =
                document.getElementById("ganttSelect");

            const ganttAtual = cronogramasUsuario.find(
                c => String(c.id) === String(seletorGantt.value)
            );

            if (
                ganttAtual?.matriz_id &&
                String(ganttAtual.matriz_id) !== String(matrizAtualId)
            ) {
                const idOutraMatriz = String(ganttAtual.matriz_id);

                const raciOutro = await requisicaoApi(
                    `/matrizes/${idOutraMatriz}/raci`
                );

                if (String(workspaceAtualId) !== workspaceId) return;

                const assinaturaNova = assinaturaRaci(raciOutro);
                const assinaturaAnterior =
                    assinaturasRaci.get(idOutraMatriz);

                if (
                    assinaturaAnterior === undefined ||
                    assinaturaAnterior !== assinaturaNova
                ) {
                    assinaturasRaci.set(idOutraMatriz, assinaturaNova);
                    await renderizarGanttVinculado();
                }
            }

            // 6. Tarefas de cronogramas independentes.
            const cronogramaAtual = cronogramasUsuario.find(
                c => String(c.id) === String(seletorGantt.value)
            );

            if (
                cronogramaAtual &&
                !cronogramaAtual.matriz_id
            ) {
                const tarefasNovas = await requisicaoApi(
                    `/cronogramas/${cronogramaAtual.id}/tarefas`
                );

                if (String(workspaceAtualId) !== workspaceId) return;

                const idCronograma = String(cronogramaAtual.id);
                const assinaturaNova =
                    assinaturaTarefasGantt(tarefasNovas);

                const assinaturaAnterior =
                    assinaturasGantt.get(idCronograma);

                if (
                    assinaturaAnterior === undefined ||
                    assinaturaAnterior !== assinaturaNova
                ) {
                    assinaturasGantt.set(
                        idCronograma,
                        assinaturaNova
                    );
                    await renderizarGanttVinculado();
                }
            }
        } catch (error) {
            console.warn(
                "Erro na sincronização automática:",
                error
            );
        } finally {
            emExecucao = false;
        }
    }

    // Atualiza periodicamente enquanto a aba estiver visível.
    setInterval(sincronizar, INTERVALO_MS);

    // Sincroniza quando o usuário retorna à página.
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            sincronizar();
        }
    });
})();