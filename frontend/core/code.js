const sidebar = document.getElementById("sidebar");
const toggleSidebar = document.getElementById("toggleSidebar");
const toast = document.getElementById("toast");
const supabaseClient = window.supabaseClient;

const seletorMatriz = document.getElementById("matrixSelect-raci");
const tituloMatriz = document.querySelector(".raci-panel .matrix-title-row h2");
const tituloGanttEditavel = document.querySelector("#view-gantt .gantt-panel .matrix-title-row h2");
const tabelaRaci = document.querySelector(".raci-table");
const cabecalhoRaci = tabelaRaci.querySelector("thead");
const corpoRaci = tabelaRaci.querySelector("tbody");

const botaoMenuMatriz = document.getElementById("btn-menu-matriz");
const menuMatriz = document.getElementById("menu-matriz");
const wrapperMenuMatriz = document.querySelector("#view-raci .menu-actions-wrapper");

const botaoMenuGrafico = document.getElementById("btn-menu-grafico");
const menuGrafico = document.getElementById("menu-grafico");
const wrapperMenuGrafico = botaoMenuGrafico.closest(".menu-actions-wrapper");


const menuRaci = document.getElementById("menu-raci");

let atribuicaoAlvoRaci = null;
let cronogramasUsuario = [];
let versaoRenderGantt = 0;

// O seletor ficará fora da tabela para não ser cortado pelo scroll.
document.body.appendChild(menuRaci);

let toastTimer;
let matrizAtualId = null;

let dadosRaci = {
    tarefas: [],
    membros: [],
    atribuicoes: []
};

const papeisRaci = ["R", "A", "C", "I", "S"];

// COMUNICAÇÃO COM A API: SEMPRE ENVIA O TOKEN DO USUÁRIO
async function requisicaoApi(caminho, opcoes = {}) {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    const token = data.session?.access_token;

    if (!token) {
        throw new Error("Sua sessão expirou. Entre novamente.");
    }

    const resposta = await fetch(
        `${window.NEXUS_CONFIG.API_BASE_URL}${caminho}`,
        {
            ...opcoes,
            headers: {
                ...(opcoes.body
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...opcoes.headers,
                Authorization: `Bearer ${token}`
            }
        }
    );

    let resultado = null;

    if (resposta.status !== 204) {
        try {
            resultado = await resposta.json();
        } catch {
            resultado = null;
        }
    }

    if (!resposta.ok) {
        const detalhe = resultado?.detail;
        throw new Error(
            typeof detalhe === "string"
                ? detalhe
                : `Erro HTTP ${resposta.status}`
        );
    }

    return resultado;
}

// NOTIFICAÇÕES
function showToast(mensagem) {
    toast.textContent = mensagem;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

// CARREGAR MATRIZES DO USUÁRIO
async function carregarMatrizes(idSelecionado = null) {
    const matrizes = await requisicaoApi("/matrizes/");

    seletorMatriz.replaceChildren();

    matrizes.forEach(matriz => {
        const opcao = document.createElement("option");
        opcao.value = matriz.id;
        opcao.textContent = matriz.nome;
        seletorMatriz.appendChild(opcao);
    });

    if (!matrizes.length) {
        matrizAtualId = null;
        tituloMatriz.textContent = "Nenhuma matriz";
        renderizarRaci();
        return;
    }

    const selecionada =
        matrizes.find(matriz => matriz.id === idSelecionado) ||
        matrizes[0];

    seletorMatriz.value = selecionada.id;
    await carregarDadosRaci(selecionada.id);
}

// CARREGAR TAREFAS, MEMBROS E PAPÉIS DA MATRIZ
async function carregarDadosRaci(matrizId) {
    matrizAtualId = String(matrizId);

    const opcaoMatriz = [...seletorMatriz.options].find(
        opcao => opcao.value === matrizAtualId
    );

    if (opcaoMatriz) {
        seletorMatriz.value = matrizAtualId;
    }

    dadosRaci = await requisicaoApi(
        `/matrizes/${matrizAtualId}/raci`
    );

    if (opcaoMatriz) {
        tituloMatriz.textContent = opcaoMatriz.textContent;
    }

    renderizarRaci();

    await atualizarEstadoMenuMatriz();
    await renderizarGanttVinculado();
}


// EDIÇÃO DE TEXTO COM DUPLO CLIQUE
function ativarEdicaoDuploClique(elemento, salvar, depoisDeSalvar) {
    elemento.addEventListener("dblclick", () => {
        if (elemento.dataset.editando === "true") return;

        elemento.dataset.editando = "true";

        const valorAnterior = elemento.textContent.trim();
        const campo = document.createElement("input");

        campo.type = "text";
        campo.value = valorAnterior;
        campo.maxLength = 150;
        campo.className = "raci-inline-edit";

        elemento.replaceWith(campo);
        campo.focus();
        campo.select();

        let finalizado = false;

        async function finalizar(confirmar) {
            if (finalizado) return;
            finalizado = true;

            const novoValor = campo.value.trim();

            if (
                !confirmar ||
                !novoValor ||
                novoValor === valorAnterior
            ) {
                elemento.dataset.editando = "false";
                campo.replaceWith(elemento);

                if (confirmar && !novoValor) {
                    showToast("O nome não pode ficar vazio.");
                }
                return;
            }

            campo.disabled = true;

            try {
                await salvar(novoValor);
                elemento.textContent = novoValor;
                elemento.dataset.editando = "false";
                campo.replaceWith(elemento);

                if (depoisDeSalvar) {
                    await depoisDeSalvar(novoValor);
                }
            } catch (error) {
                console.error("Erro ao salvar edição:", error);
                showToast(`Não foi possível salvar: ${error.message}`);
                elemento.dataset.editando = "false";
                campo.replaceWith(elemento);
            }
        }

        campo.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                finalizar(true);
            }

            if (event.key === "Escape") {
                finalizar(false);
            }
        });

        campo.addEventListener("blur", () => finalizar(true));
    });
}

// BOTÃO DE EXCLUSÃO
function criarBotaoExcluir(rotulo, acao) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "raci-delete-button";
    botao.title = `Excluir ${rotulo}`;
    botao.setAttribute("aria-label", `Excluir ${rotulo}`);
    botao.innerHTML = '<i class="fa-solid fa-trash"></i>';

    botao.addEventListener("click", async event => {
        event.stopPropagation();
        await acao();
    });

    return botao;
}

// APAGAR TAREFA
async function excluirTarefa(tarefa) {
    if (tarefa.is_padrao) {
        showToast("A tarefa padrão não pode ser excluída.");
        return;
    }

    if (!confirm(`Excluir a tarefa "${tarefa.nome}"?`)) return;

    try {
        await requisicaoApi(
            `/matrizes/${matrizAtualId}/tarefas-raci/${tarefa.id}`,
            { method: "DELETE" }
        );

        await carregarDadosRaci(matrizAtualId);
        showToast("Tarefa excluída.");
    } catch (error) {
        showToast(`Erro ao excluir tarefa: ${error.message}`);
    }
}

// APAGAR MEMBRO
async function excluirMembro(membro) {
    if (membro.is_padrao) {
        showToast("O membro padrão não pode ser excluído.");
        return;
    }

    if (!confirm(`Excluir o membro "${membro.nome}"?`)) return;

    try {
        await requisicaoApi(
            `/matrizes/${matrizAtualId}/membros/${membro.id}`,
            { method: "DELETE" }
        );

        await carregarDadosRaci(matrizAtualId);
        showToast("Membro excluído.");
    } catch (error) {
        showToast(`Erro ao excluir membro: ${error.message}`);
    }
}

// DEFINIR OU REMOVER UM PAPEL RACIS
function fecharMenuRaci() {
    menuRaci.classList.add("hidden");
    atribuicaoAlvoRaci = null;
}

function abrirMenuRaci(event, tarefa, membro) {
    event.stopPropagation();
    atribuicaoAlvoRaci = { tarefa, membro };

    const atual = dadosRaci.atribuicoes.find(item =>
        item.tarefa_id === tarefa.id &&
        item.membro_id === membro.id
    );

    // Destaca o papel que já está salvo.
    menuRaci.querySelectorAll("[data-valor]").forEach(botao => {
        botao.classList.toggle(
            "papel-selecionado",
            botao.dataset.valor === (atual?.papel || "-")
        );
    });

    menuRaci.classList.remove("hidden");

    // Posiciona o seletor próximo à célula clicada.
    const rect = event.currentTarget.getBoundingClientRect();
    const largura = menuRaci.offsetWidth;
    const altura = menuRaci.offsetHeight;

    let esquerda = rect.left + rect.width / 2 - largura / 2;
    esquerda = Math.max(
        8,
        Math.min(esquerda, window.innerWidth - largura - 8)
    );

    let topo = rect.bottom + 7;

    if (topo + altura > window.innerHeight - 8) {
        topo = rect.top - altura - 7;
    }

    menuRaci.style.left = `${esquerda}px`;
    menuRaci.style.top = `${Math.max(8, topo)}px`;
}

async function salvarPapelRaci(papel) {
    if (!atribuicaoAlvoRaci) return;

    const { tarefa, membro } = atribuicaoAlvoRaci;

    const atual = dadosRaci.atribuicoes.find(item =>
        item.tarefa_id === tarefa.id &&
        item.membro_id === membro.id
    );

    fecharMenuRaci();

    try {
        if (papel === "-") {
            if (!atual) return;

            await requisicaoApi(
                `/matrizes/${matrizAtualId}/atribuicoes/${tarefa.id}/${membro.id}`,
                { method: "DELETE" }
            );
        } else {
            await requisicaoApi(
                `/matrizes/${matrizAtualId}/atribuicoes`,
                {
                    method: "PUT",
                    body: JSON.stringify({
                        tarefa_id: tarefa.id,
                        membro_id: membro.id,
                        papel
                    })
                }
            );
        }

        await carregarDadosRaci(matrizAtualId);
    } catch (error) {
        showToast(`Não foi possível salvar o papel: ${error.message}`);
    }
}

// MONTAR A TABELA RACIS COM DADOS REAIS
function renderizarRaci() {
    cabecalhoRaci.replaceChildren();
    corpoRaci.replaceChildren();

    const linhaCabecalho = document.createElement("tr");
    const colunaTarefa = document.createElement("th");

    colunaTarefa.className = "task-head";
    colunaTarefa.textContent = "Tarefa / Atividade";
    linhaCabecalho.appendChild(colunaTarefa);

    dadosRaci.membros.forEach(membro => {
        const th = document.createElement("th");
        const cabecalhoMembro = document.createElement("span");
        const nomeMembro = document.createElement("span");

        cabecalhoMembro.className = "member-head";
        nomeMembro.className = "member-name";
        nomeMembro.textContent = membro.nome;
        nomeMembro.title = "Dê dois cliques para editar";

        ativarEdicaoDuploClique(
            nomeMembro,
            async nome => {
                await requisicaoApi(
                    `/matrizes/${matrizAtualId}/membros/${membro.id}`,
                    {
                        method: "PUT",
                        body: JSON.stringify({ nome })
                    }
                );
            },
            async () => carregarDadosRaci(matrizAtualId)
        );

        cabecalhoMembro.appendChild(nomeMembro);

        if (!membro.is_padrao) {
            cabecalhoMembro.appendChild(
                criarBotaoExcluir(
                    membro.nome,
                    () => excluirMembro(membro)
                )
            );
        }

        th.appendChild(cabecalhoMembro);
        linhaCabecalho.appendChild(th);
    });

    cabecalhoRaci.appendChild(linhaCabecalho);

    dadosRaci.tarefas.forEach((tarefa, indice) => {
        const linha = document.createElement("tr");
        const celulaTarefa = document.createElement("th");
        const grupoTarefa = document.createElement("div");
        const indiceTarefa = document.createElement("span");
        const nomeTarefa = document.createElement("span");

        celulaTarefa.scope = "row";
        grupoTarefa.className = "raci-task-name";
        indiceTarefa.className = "task-index";
        indiceTarefa.textContent = String(indice + 1).padStart(2, "0");

        nomeTarefa.className = "raci-editable-name";
        nomeTarefa.textContent = tarefa.nome;
        nomeTarefa.title = "Dê dois cliques para editar";

        ativarEdicaoDuploClique(
            nomeTarefa,
            async nome => {
                await requisicaoApi(
                    `/matrizes/${matrizAtualId}/tarefas-raci/${tarefa.id}`,
                    {
                        method: "PUT",
                        body: JSON.stringify({ nome })
                    }
                );
            },
            async () => carregarDadosRaci(matrizAtualId)
        );

        grupoTarefa.append(indiceTarefa, nomeTarefa);

        if (!tarefa.is_padrao) {
            grupoTarefa.appendChild(
                criarBotaoExcluir(
                    tarefa.nome,
                    () => excluirTarefa(tarefa)
                )
            );
        }

        celulaTarefa.appendChild(grupoTarefa);
        linha.appendChild(celulaTarefa);

        dadosRaci.membros.forEach(membro => {
            const celula = document.createElement("td");
            const atribuicao = dadosRaci.atribuicoes.find(item =>
                item.tarefa_id === tarefa.id &&
                item.membro_id === membro.id
            );

            const botaoPapel = document.createElement("button");
            botaoPapel.type = "button";
            botaoPapel.className = atribuicao
                ? `role-badge role-${atribuicao.papel.toLowerCase()}`
                : "role-badge role-none";

            botaoPapel.title = atribuicao
                ? `Papel ${atribuicao.papel} — clique para alterar`
                : "Sem atribuição — clique para definir";

            if (atribuicao) {
                botaoPapel.textContent = atribuicao.papel;
            } else {
                botaoPapel.innerHTML =
                    '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
            }

            botaoPapel.addEventListener("click", event => {
                abrirMenuRaci(event, tarefa, membro);
            });

            celula.appendChild(botaoPapel);
            linha.appendChild(celula);
        });

        corpoRaci.appendChild(linha);
    });
}

// RENOMEAR UMA MATRIZ COM DUPLO CLIQUE
ativarEdicaoDuploClique(
    tituloMatriz,
    async nome => {
        await requisicaoApi(`/matrizes/${matrizAtualId}`, {
            method: "PUT",
            body: JSON.stringify({ nome })
        });
    },
    async nome => {
        const opcao = seletorMatriz.selectedOptions[0];

        if (opcao) {
            opcao.textContent = nome;
        }

        await atualizarEstadoMenuMatriz();
        await renderizarGanttVinculado();
    }
);

ativarEdicaoDuploClique(
    tituloGanttEditavel,

    async nome => {
        const seletor = document.getElementById("ganttSelect");

        const grafico = cronogramasUsuario.find(
            item => String(item.id) === String(seletor.value)
        );

        if (!grafico) {
            throw new Error("Nenhum gráfico foi selecionado.");
        }

        // gráficos vinculados mantêm o nome sincronizado
        // com a matriz; gráficos independentes alteram seu próprio nome.
        if (grafico.matriz_id) {
            await requisicaoApi(`/matrizes/${grafico.matriz_id}`, {
                method: "PUT",
                body: JSON.stringify({ nome })
            });
        } else {
            await requisicaoApi(`/cronogramas/${grafico.id}`, {
                method: "PUT",
                body: JSON.stringify({ nome })
            });
        }
    },

    async nome => {
        const seletor = document.getElementById("ganttSelect");

        const grafico = cronogramasUsuario.find(
            item => String(item.id) === String(seletor.value)
        );

        if (!grafico) return;

        // atualiza o nome na lista de matrizes quando
        // o gráfico está vinculado à matriz correspondente.
        if (grafico.matriz_id) {
            const opcaoMatriz = Array.from(seletorMatriz.options).find(
                opcao =>
                    String(opcao.value) === String(grafico.matriz_id)
            );

            if (opcaoMatriz) {
                opcaoMatriz.textContent = nome;
            }

            if (String(matrizAtualId) === String(grafico.matriz_id)) {
                tituloMatriz.textContent = nome;
            }
        }

        // recarrega os dados e atualiza o título exibido.
        const graficoId = String(grafico.id);

        await atualizarEstadoMenuMatriz();

        const seletorAtualizado = document.getElementById("ganttSelect");

        if (
            Array.from(seletorAtualizado.options).some(
                opcao => String(opcao.value) === graficoId
            )
        ) {
            seletorAtualizado.value = graficoId;
        }

        atualizarEstadoMenuGrafico();
        await renderizarGanttVinculado();
    }
);

// SELECIONAR OUTRA MATRIZ
seletorMatriz.addEventListener("change", async () => {
    const matrizId = seletorMatriz.value;
    if (!matrizId) return;

    try {
        await carregarDadosRaci(matrizId);
    } catch (error) {
        showToast(`Erro ao carregar matriz: ${error.message}`);
    }
});

// CRIAR TAREFA
async function adicionarTarefa() {
    const nome = prompt("Nome da nova tarefa:");
    if (nome === null) return;
    if (!nome.trim()) {
        showToast("Informe o nome da tarefa.");
        return;
    }

    try {
        await requisicaoApi(
            `/matrizes/${matrizAtualId}/tarefas-raci`,
            {
                method: "POST",
                body: JSON.stringify({ nome: nome.trim() })
            }
        );

        await carregarDadosRaci(matrizAtualId);
        showToast("Tarefa criada.");
    } catch (error) {
        showToast(`Erro ao criar tarefa: ${error.message}`);
    }
}

async function adicionarTarefaGantt() {
    const cronograma = cronogramasUsuario.find(
        item => item.id === document.getElementById("ganttSelect").value
    );

    if (!cronograma?.matriz_id) {
        showToast(
            "Vincule o cronograma a uma matriz antes de adicionar tarefas."
        );
        return;
    }

    const nome = prompt("Nome da nova tarefa:");
    if (nome === null) return;

    if (!nome.trim()) {
        showToast("Informe o nome da tarefa.");
        return;
    }

    try {
        await requisicaoApi(
            `/matrizes/${cronograma.matriz_id}/tarefas-raci`,
            {
                method: "POST",
                body: JSON.stringify({ nome: nome.trim() })
            }
        );

        await carregarDadosRaci(cronograma.matriz_id);

        showToast("Tarefa adicionada à matriz e ao cronograma.");
    } catch (error) {
        showToast(`Erro ao criar tarefa: ${error.message}`);
    }
}

// CRIAR MEMBRO
async function adicionarMembro() {
    const nome = prompt("Nome do novo membro:");
    if (nome === null) return;
    if (!nome.trim()) {
        showToast("Informe o nome do membro.");
        return;
    }

    try {
        await requisicaoApi(
            `/matrizes/${matrizAtualId}/membros`,
            {
                method: "POST",
                body: JSON.stringify({ nome: nome.trim() })
            }
        );

        await carregarDadosRaci(matrizAtualId);
        showToast("Membro adicionado.");
    } catch (error) {
        showToast(`Erro ao adicionar membro: ${error.message}`);
    }
}

// PERFIL
function preencherPerfil(user) {
    const nome =
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        "Usuário";

    document
        .querySelectorAll(".profile-copy strong, .dropdown-user strong")
        .forEach(el => el.textContent = nome);

    document
        .querySelectorAll(".profile-copy small, .dropdown-user small")
        .forEach(el => el.textContent = user.email || "");

    const iniciais = nome
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(palavra => palavra[0].toUpperCase())
        .join("") || "U";

    document
        .querySelectorAll(".profile-avatar, .dropdown-user .avatar")
        .forEach(el => el.textContent = iniciais);
}

// VALIDAR SESSÃO E CARREGAR DADOS
async function verificarSessao() {
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;

        if (!data.session) {
            window.location.replace("../auth/auth_index.html");
            return;
        }

        preencherPerfil(data.session.user);
        await carregarMatrizes();
    } catch (error) {
        console.error("Erro ao iniciar NexusPM:", error);
        showToast(`Erro ao carregar o sistema: ${error.message}`);
    }
}


// ALTERADO: atualiza o vínculo da matriz e preserva o gráfico correto.
async function atualizarEstadoMenuMatriz(cronogramaSelecionadoId = null) {
    const seletorGantt = document.getElementById("ganttSelect");
    const selecaoAnterior = seletorGantt.value;

    cronogramasUsuario = await requisicaoApi("/cronogramas/");

    // ALTERADO: compara os IDs sem depender do tipo (texto ou número).
    const vinculado = cronogramasUsuario.find(
        cronograma =>
            matrizAtualId != null &&
            cronograma.matriz_id != null &&
            String(cronograma.matriz_id) === String(matrizAtualId)
    );

    menuMatriz.dataset.hasCronograma = vinculado ? "true" : "false";

    const botaoVincular = menuMatriz.querySelector(
        '[data-action="vincular"]'
    );

    botaoVincular.querySelector("span").textContent = vinculado
        ? "Desvincular gráfico de Gantt"
        : "Vincular gráfico de Gantt";

    menuMatriz.querySelector(
        '[data-action="open-cronograma"]'
    ).hidden = !vinculado;

    seletorGantt.replaceChildren();

    cronogramasUsuario.forEach(cronograma => {
        const opcao = document.createElement("option");
        opcao.value = cronograma.id;
        opcao.textContent = cronograma.nome;
        seletorGantt.appendChild(opcao);
    });

    // ALTERADO: prioriza o gráfico informado, como um gráfico recém-criado.
    const novoGraficoExiste =
        cronogramaSelecionadoId != null &&
        cronogramasUsuario.some(
            cronograma =>
                String(cronograma.id) === String(cronogramaSelecionadoId)
        );

    // ALTERADO: se não houver ID informado, preserva o gráfico anterior.
    const selecaoAnteriorExiste = cronogramasUsuario.some(
        cronograma => String(cronograma.id) === String(selecaoAnterior)
    );

    if (novoGraficoExiste) {
        seletorGantt.value = String(cronogramaSelecionadoId);
    } else if (vinculado) {
        seletorGantt.value = String(vinculado.id);
    } else if (selecaoAnteriorExiste) {
        seletorGantt.value = String(selecaoAnterior);
    } else if (cronogramasUsuario.length > 0) {
        seletorGantt.value = String(cronogramasUsuario[0].id);
    } else {
        seletorGantt.value = "";
    }

    // ALTERADO: atualiza as opções de acordo com o gráfico selecionado.
    atualizarEstadoMenuGrafico();
}



function atualizarEstadoMenuGrafico() {
    const seletor = document.getElementById("ganttSelect");

    const grafico = cronogramasUsuario.find(
        item => String(item.id) === String(seletor.value)
    );

    menuGrafico.dataset.hasCronograma = grafico ? "true" : "false";

    const botaoVincular = menuGrafico.querySelector(
        '[data-action="vincular"]'
    );

    const botaoExcluir = menuGrafico.querySelector(
        '[data-action="excluir-grafico"]'
    );

    const botaoAbrir = menuGrafico.querySelector(
        '[data-action="abrir-matriz"]'
    );

    botaoVincular.disabled = !grafico;
    botaoExcluir.disabled = !grafico;

    botaoVincular.querySelector("span").textContent =
        grafico?.matriz_id
            ? "Desvincular matriz RACIS"
            : "Vincular matriz RACIS";

    botaoAbrir.hidden = !grafico?.matriz_id;
}

async function criarGraficoGantt() {
    const nome = prompt("Nome do novo gráfico Gantt:");

    if (nome === null) return;

    if (!nome.trim()) {
        showToast("Informe um nome para o gráfico.");
        return;
    }

    try {
        const novoGrafico = await requisicaoApi("/cronogramas/", {
            method: "POST",
            body: JSON.stringify({ nome: nome.trim() })
        });

        await atualizarEstadoMenuMatriz(novoGrafico.id);
        await renderizarGanttVinculado();

        document.querySelector('[data-view="gantt"]').click();
        showToast("Gráfico criado.");
    } catch (error) {
        showToast(`Não foi possível criar o gráfico: ${error.message}`);
    }
}

async function excluirGraficoAtual() {
    const seletor = document.getElementById("ganttSelect");

    const grafico = cronogramasUsuario.find(
        item => String(item.id) === String(seletor.value)
    );

    if (!grafico) {
        showToast("Selecione um gráfico para excluir.");
        return;
    }

    if (!confirm(
        `Excluir o gráfico "${grafico.nome}"? A matriz e suas tarefas serão mantidas.`
    )) {
        return;
    }

    try {
        await requisicaoApi(`/cronogramas/${grafico.id}`, {
            method: "DELETE"
        });

        await atualizarEstadoMenuMatriz();
        await renderizarGanttVinculado();

        showToast("Gráfico excluído. A matriz e suas tarefas foram mantidas.");
    } catch (error) {
        showToast(`Não foi possível excluir o gráfico: ${error.message}`);
    }
}

async function vincularMatrizAoGraficoAtual() {
    const seletor = document.getElementById("ganttSelect");

    const grafico = cronogramasUsuario.find(
        item => String(item.id) === String(seletor.value)
    );

    if (!grafico) {
        showToast("Crie ou selecione um gráfico primeiro.");
        return;
    }

    try {
        if (grafico.matriz_id) {
            if (!confirm(
                `Desvincular "${grafico.nome}" da matriz? Os dados serão mantidos.`
            )) {
                return;
            }

            await requisicaoApi(
                `/cronogramas/${grafico.id}/vinculo`,
                {
                    method: "PUT",
                    body: JSON.stringify({ matriz_id: null })
                }
            );

            await atualizarEstadoMenuMatriz(grafico.id);
            await renderizarGanttVinculado();

            showToast("Matriz desvinculada.");
            return;
        }

        const matrizes = await requisicaoApi("/matrizes/");

        // Impede vincular uma matriz já usada por outro gráfico.
        const matrizesOcupadas = new Set(
            cronogramasUsuario
                .filter(item =>
                    String(item.id) !== String(grafico.id) &&
                    item.matriz_id
                )
                .map(item => String(item.matriz_id))
        );

        const disponiveis = matrizes.filter(
            matriz => !matrizesOcupadas.has(String(matriz.id))
        );

        if (!disponiveis.length) {
            showToast("Não há matrizes disponíveis para vincular.");
            return;
        }

        const lista = disponiveis
            .map((matriz, indice) => `${indice + 1}. ${matriz.nome}`)
            .join("\n");

        const resposta = prompt(
            `Escolha a matriz para "${grafico.nome}":\n\n${lista}\n\nDigite o número desejado.`,
            "1"
        );

        if (resposta === null) return;

        const indice = Number(resposta) - 1;

        if (!Number.isInteger(indice) || !disponiveis[indice]) {
            showToast("Seleção de matriz inválida.");
            return;
        }

        await requisicaoApi(
            `/cronogramas/${grafico.id}/vinculo`,
            {
                method: "PUT",
                body: JSON.stringify({
                    matriz_id: disponiveis[indice].id
                })
            }
        );

        await atualizarEstadoMenuMatriz(grafico.id);
        await renderizarGanttVinculado();

        showToast("Matriz vinculada ao gráfico.");
    } catch (error) {
        showToast(`Não foi possível atualizar o vínculo: ${error.message}`);
    }
}

async function abrirMatrizVinculada() {
    const seletor = document.getElementById("ganttSelect");

    const grafico = cronogramasUsuario.find(
        item => String(item.id) === String(seletor.value)
    );

    if (!grafico?.matriz_id) {
        showToast("Este gráfico não possui uma matriz vinculada.");
        return;
    }

    try {
        await carregarMatrizes(grafico.matriz_id);
        document.querySelector('[data-view="raci"]').click();
    } catch (error) {
        showToast(`Não foi possível abrir a matriz: ${error.message}`);
    }
}

async function exportarGraficoExcel() {
    if (!window.XLSX) {
        throw new Error("A biblioteca Excel não foi carregada.");
    }

    const seletor = document.getElementById("ganttSelect");

    const grafico = cronogramasUsuario.find(
        item => String(item.id) === String(seletor.value)
    );

    if (!grafico) {
        showToast("Selecione um gráfico para exportar.");
        return;
    }

    if (!grafico.matriz_id) {
        showToast("Vincule uma matriz antes de exportar as tarefas.");
        return;
    }

    const raci = String(grafico.matriz_id) === String(matrizAtualId)
        ? dadosRaci
        : await requisicaoApi(`/matrizes/${grafico.matriz_id}/raci`);

    const linhas = [[
        "Tarefa / Atividade",
        ...(raci.membros || []).map(membro => membro.nome)
    ]];

    (raci.tarefas || []).forEach(tarefa => {
        const linha = [tarefa.nome];

        (raci.membros || []).forEach(membro => {
            const atribuicao = (raci.atribuicoes || []).find(item =>
                item.tarefa_id === tarefa.id &&
                item.membro_id === membro.id
            );

            linha.push(atribuicao?.papel || "-");
        });

        linhas.push(linha);
    });

    const planilha = XLSX.utils.aoa_to_sheet(linhas);
    const livro = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(livro, planilha, "Tarefas do Gantt");

    const nomeArquivo = grafico.nome
        .replace(/[\\/:*?"<>|]/g, "_");

    XLSX.writeFile(livro, `${nomeArquivo}.xlsx`);
}


async function renderizarGanttVinculado() {
    const versao = ++versaoRenderGantt;

    const seletorGantt = document.getElementById("ganttSelect");
    const colunaTarefas = document.querySelector(".gantt-task-column");
    const timeline = document.querySelector(".gantt-timeline");

    const tituloGantt = document.querySelector(
        "#view-gantt .gantt-panel .matrix-title-row h2"
    );

    const tituloContexto = document.querySelector(
        ".gantt-context-card strong"
    );

    const descricaoContexto = document.querySelector(
        ".gantt-context-card small"
    );

    const seloVinculo = document.querySelector(".connected-pill");

    if (!colunaTarefas || !timeline) return;

    // Identifica o cronograma selecionado.
    const cronograma =
        cronogramasUsuario.find(
            item => String(item.id) === String(seletorGantt.value)
        ) ||
        (
            matrizAtualId != null
                ? cronogramasUsuario.find(
                    item =>
                        item.matriz_id != null &&
                        String(item.matriz_id) === String(matrizAtualId)
                )
                : null
        ) ||
        null;

    // Remove as linhas estáticas ou renderizadas anteriormente.
    colunaTarefas.querySelectorAll(".gantt-task-row")
        .forEach(linha => linha.remove());

    timeline.querySelectorAll(".gantt-grid-row")
        .forEach(linha => linha.remove());

    function adicionarLinhaVazia(nome, detalhe) {
        const linha = document.createElement("div");
        linha.className = "gantt-task-row";

        const texto = document.createElement("span");
        texto.textContent = nome;

        const status = document.createElement("small");
        status.textContent = detalhe;

        linha.append(texto, status);
        colunaTarefas.appendChild(linha);

        const linhaTempo = document.createElement("div");
        linhaTempo.className = "gantt-grid-row";
        timeline.appendChild(linhaTempo);
    }

    const vinculado = Boolean(cronograma?.matriz_id);

    if (tituloGantt) {
        tituloGantt.textContent = cronograma?.nome || "Cronograma Gantt";
    }

    if (tituloContexto) {
        tituloContexto.textContent = vinculado
            ? `Cronograma vinculado à matriz "${cronograma.nome}"`
            : "Cronograma independente";
    }

    if (descricaoContexto) {
        descricaoContexto.textContent = vinculado
            ? "Tarefas e nomes sincronizados com a matriz RACIS."
            : "Vincule uma matriz para compartilhar as tarefas.";
    }

    if (seloVinculo) {
        seloVinculo.hidden = !cronograma;

        seloVinculo.classList.toggle(
            "is-disconnected",
            Boolean(cronograma) && !vinculado
        );

        if (cronograma) {
            seloVinculo.innerHTML = vinculado
                ? '<i class="fa-solid fa-check"></i> Vinculado'
                : '<i class="fa-solid fa-link-slash"></i> Não vinculado';
        }
    }

    if (!cronograma) {
        adicionarLinhaVazia(
            "Nenhum cronograma selecionado",
            "Sem vínculo"
        );
        return;
    }

    if (!cronograma.matriz_id) {
        adicionarLinhaVazia(
            "Nenhuma matriz vinculada",
            "Cronograma independente"
        );
        return;
    }

    let tarefas;

    try {
        // Reutiliza os dados já carregados quando possível.
        if (
            String(cronograma.matriz_id) === String(matrizAtualId)
        ) {
            tarefas = dadosRaci.tarefas;
        } else {
            // Consulta a matriz associada ao cronograma selecionado.
            const dados = await requisicaoApi(
                `/matrizes/${cronograma.matriz_id}/raci`
            );

            tarefas = dados.tarefas || [];
        }
    } catch (error) {
        if (versao !== versaoRenderGantt) return;

        adicionarLinhaVazia(
            "Não foi possível carregar as tarefas",
            "Erro de carregamento"
        );

        console.error("Erro ao carregar tarefas do Gantt:", error);
        return;
    }

    // Evita renderizar uma resposta antiga se houver outra atualização.
    if (versao !== versaoRenderGantt) return;

    if (!tarefas.length) {
        adicionarLinhaVazia(
            "Nenhuma tarefa cadastrada",
            "Adicione uma tarefa à matriz"
        );
        return;
    }

    tarefas.forEach((tarefa, indice) => {
        const linha = document.createElement("div");
        linha.className = "gantt-task-row";

        const grupo = document.createElement("span");

        const numero = document.createElement("b");
        numero.textContent = String(indice + 1).padStart(2, "0");

        const nomeTarefa = document.createElement("span");
        nomeTarefa.textContent = tarefa.nome;
        nomeTarefa.title = "Dê dois cliques para renomear";

        grupo.append(numero, nomeTarefa);
        linha.appendChild(grupo);

        const status = document.createElement("small");
        status.textContent = "Sem datas";
        linha.appendChild(status);

        colunaTarefas.appendChild(linha);

        // Uma linha temporal correspondente a cada tarefa.
        const linhaTempo = document.createElement("div");
        linhaTempo.className = "gantt-grid-row";
        timeline.appendChild(linhaTempo);

        // Renomear no Gantt também altera a tarefa da matriz.
        ativarEdicaoDuploClique(
            nomeTarefa,

            async novoNome => {
                await requisicaoApi(
                    `/matrizes/${cronograma.matriz_id}/tarefas-raci/${tarefa.id}`,
                    {
                        method: "PUT",
                        body: JSON.stringify({ nome: novoNome })
                    }
                );
            },

            async () => {
                await carregarDadosRaci(cronograma.matriz_id);
            }
        );
    });
}

function fecharMenuMatriz() {
    menuMatriz.classList.add("hidden");
    botaoMenuMatriz.setAttribute("aria-expanded", "false");
}

function fecharMenuGrafico() {
    menuGrafico.classList.add("hidden");
    botaoMenuGrafico.setAttribute("aria-expanded", "false");
}

botaoMenuMatriz.addEventListener("click", event => {
    event.stopPropagation();

    const vaiAbrir = menuMatriz.classList.contains("hidden");

    fecharMenuGrafico();
    menuMatriz.classList.toggle("hidden", !vaiAbrir);
    botaoMenuMatriz.setAttribute("aria-expanded", String(vaiAbrir));
});

botaoMenuGrafico.addEventListener("click", event => {
    event.stopPropagation();

    const vaiAbrir = menuGrafico.classList.contains("hidden");

    fecharMenuMatriz();
    menuGrafico.classList.toggle("hidden", !vaiAbrir);
    botaoMenuGrafico.setAttribute("aria-expanded", String(vaiAbrir));
});

document.addEventListener("click", event => {
    if (!wrapperMenuMatriz.contains(event.target)) {
        fecharMenuMatriz();
    }

    if (!wrapperMenuGrafico.contains(event.target)) {
        fecharMenuGrafico();
    }
});

// MENU LATERAL
toggleSidebar.addEventListener("click", () => {
    const recolhida = sidebar.classList.toggle("collapsed");
    sidebar.classList.toggle("expanded", !recolhida);

    toggleSidebar.innerHTML = recolhida
        ? '<i class="fa-solid fa-bars"></i>'
        : '<i class="fa-solid fa-angles-left"></i>';

    toggleSidebar.setAttribute(
        "aria-label",
        recolhida ? "Expandir menu" : "Recolher menu"
    );
});


async function exportarMatrizExcel() {
    if (!window.XLSX) {
        throw new Error("A biblioteca Excel não foi carregada.");
    }

    const linhas = [
        [
            "Tarefa / Atividade",
            ...dadosRaci.membros.map(membro => membro.nome)
        ]
    ];

    dadosRaci.tarefas.forEach(tarefa => {
        const linha = [tarefa.nome];

        dadosRaci.membros.forEach(membro => {
            const atribuicao = dadosRaci.atribuicoes.find(item =>
                item.tarefa_id === tarefa.id &&
                item.membro_id === membro.id
            );

            linha.push(atribuicao?.papel || "-");
        });

        linhas.push(linha);
    });

    const planilha = XLSX.utils.aoa_to_sheet(linhas);
    const livro = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(livro, planilha, "Matriz RACIS");

    const nomeArquivo = (tituloMatriz.textContent.trim() || "Matriz")
        .replace(/[\\/:*?"<>|]/g, "_");

    XLSX.writeFile(livro, `${nomeArquivo}.xlsx`);
}

async function excluirMatrizAtual() {
    const nome = seletorMatriz.selectedOptions[0]?.textContent || "esta matriz";

    if (!confirm(`Tem certeza de que deseja excluir "${nome}"? Esta ação não pode ser desfeita.`)) {
        return;
    }

    try {
        await requisicaoApi(`/matrizes/${matrizAtualId}`, {
            method: "DELETE"
        });

        await carregarMatrizes();
        await atualizarEstadoMenuMatriz();

        showToast("Matriz excluída.");
    } catch (error) {
        showToast(`Não foi possível excluir: ${error.message}`);
    }
}

async function vincularMatrizAGantt() {
    await atualizarEstadoMenuMatriz();

    const vinculado = cronogramasUsuario.find(
        cronograma =>
            matrizAtualId != null &&
            cronograma.matriz_id != null &&
            String(cronograma.matriz_id) === String(matrizAtualId)
    );

    if (vinculado) {
        if (!confirm(
            `Desvincular "${vinculado.nome}" desta matriz? O cronograma será mantido.`
        )) {
            return;
        }

        await requisicaoApi(
            `/cronogramas/${vinculado.id}/vinculo`,
            {
                method: "PUT",
                body: JSON.stringify({ matriz_id: null })
            }
        );

        await atualizarEstadoMenuMatriz();
        await renderizarGanttVinculado();

        showToast("Cronograma desvinculado. Os dados foram mantidos.");
        return;
    }

    const disponiveis = cronogramasUsuario.filter(
        cronograma => !cronograma.matriz_id
    );

    let cronograma;

    if (disponiveis.length > 0) {
        const lista = disponiveis
            .map((item, indice) => `${indice + 1}. ${item.nome}`)
            .join("\n");

        const resposta = prompt(
            `Escolha o cronograma para vincular:\n\n${lista}\n\nDigite o número desejado.`,
            "1"
        );

        if (resposta === null) return;

        const indice = Number(resposta) - 1;

        if (!Number.isInteger(indice) || !disponiveis[indice]) {
            showToast("Seleção de cronograma inválida.");
            return;
        }

        cronograma = disponiveis[indice];
    } else {
        const nome = prompt(
            "Não há cronogramas independentes disponíveis. Nome do novo cronograma:",
            `${tituloMatriz.textContent} - Cronograma`
        );

        if (nome === null) return;

        if (!nome.trim()) {
            showToast("Informe um nome para o cronograma.");
            return;
        }

        cronograma = await requisicaoApi("/cronogramas/", {
            method: "POST",
            body: JSON.stringify({ nome: nome.trim() })
        });
    }

    await requisicaoApi(
        `/cronogramas/${cronograma.id}/vinculo`,
        {
            method: "PUT",
            body: JSON.stringify({ matriz_id: matrizAtualId })
        }
    );

    await atualizarEstadoMenuMatriz();
    await renderizarGanttVinculado();

    showToast("Matriz vinculada ao gráfico de Gantt.");
}


async function abrirCronogramaVinculado() {
    await atualizarEstadoMenuMatriz();

    const cronograma = cronogramasUsuario.find(
        item => item.matriz_id === matrizAtualId
    );

    if (!cronograma) {
        showToast("Esta matriz não possui um cronograma vinculado.");
        return;
    }

    document.getElementById("ganttSelect").value = cronograma.id;

    const tituloGantt = document.querySelector(
        "#view-gantt .gantt-panel .matrix-title-row h2"
    );

    if (tituloGantt) {
        tituloGantt.textContent = cronograma.nome;
    }

    document.querySelector('[data-view="gantt"]').click();
}

// ALTERNAR ENTRE RACIS E GANTT
document.querySelectorAll("[data-view]").forEach(botao => {
    botao.addEventListener("click", () => {
        document.querySelectorAll("[data-view]").forEach(item => {
            const ativo = item === botao;
            item.classList.toggle("active", ativo);

            if (ativo) item.setAttribute("aria-current", "page");
            else item.removeAttribute("aria-current");
        });

        document.querySelectorAll(".view").forEach(view => {
            view.classList.toggle(
                "active",
                view.id === `view-${botao.dataset.view}`
            );
        });
    });
});

// AÇÕES DA INTERFACE
document.querySelectorAll("[data-demo-action]").forEach(botao => {
    const acao = botao.dataset.demoAction;

    if (acao === "sair") {
        botao.addEventListener("click", async () => {
            try {
                const { error } = await supabaseClient.auth.signOut();
                if (error) throw error;

                window.location.replace("../auth/auth_index.html");
            } catch (error) {
                showToast(`Erro ao sair: ${error.message}`);
            }
        });

    } else if (acao === "nova-matriz") {
        botao.addEventListener("click", async () => {
            const nome = prompt("Nome da nova matriz:");

            if (nome === null) return;

            if (!nome.trim()) {
                showToast("Informe o nome da matriz.");
                return;
            }

            botao.disabled = true;

            try {
                const nova = await requisicaoApi("/matrizes/", {
                    method: "POST",
                    body: JSON.stringify({ nome: nome.trim() })
                });

                await carregarMatrizes(nova.id);
                showToast("Matriz criada.");
            } catch (error) {
                showToast(`Erro ao criar matriz: ${error.message}`);
            } finally {
                botao.disabled = false;
            }
        });

    } else if (acao === "novo-grafico") {
        botao.addEventListener("click", criarGraficoGantt);

    } else if (acao === "nova-tarefa") {
        botao.addEventListener("click", adicionarTarefaGantt);

    } else if (acao === "adicionar-tarefa") {
        botao.addEventListener("click", adicionarTarefa);

    } else if (acao === "adicionar-membro") {
        botao.addEventListener("click", adicionarMembro);

    // ALTERADO: direciona a exportação para a tela ativa.
    } else if (acao === "exportar") {
        botao.addEventListener("click", async () => {
            try {
                const ganttAtivo = document
                    .getElementById("view-gantt")
                    .classList.contains("active");

                if (ganttAtivo) {
                    await exportarGraficoExcel();
                } else {
                    await exportarMatrizExcel();
                }
            } catch (error) {
                console.error("Erro ao exportar:", error);
                showToast(
                    `Não foi possível exportar: ${error.message}`
                );
            }
        });

    } else {
        botao.addEventListener("click", () => {
            showToast(
                "Esta função será implementada na próxima etapa."
            );
        });
    }
});

document.getElementById("inviteButton").addEventListener("click", () => {
    showToast("Convites serão implementados em uma próxima etapa.");
});

document.getElementById("teamButton").addEventListener("click", () => {
    showToast("A seleção de equipe será implementada posteriormente.");
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        fecharMenuMatriz();
        fecharMenuGrafico();
        fecharMenuRaci();
    }
});

menuMatriz.querySelectorAll("[data-action]").forEach(botao => {
    botao.addEventListener("click", async () => {
        const acao = botao.dataset.action;

        fecharMenuMatriz();

        try {
            if (acao === "vincular") {
                await vincularMatrizAGantt();
            } else if (acao === "gerar-excel") {
                await exportarMatrizExcel();
            } else if (acao === "open-cronograma") {
                await abrirCronogramaVinculado();
            } else if (acao === "delete") {
                await excluirMatrizAtual();
            }
        } catch (error) {
            console.error("Erro no menu da matriz:", error);
            showToast(`Não foi possível executar a ação: ${error.message}`);
        }
    });
});

menuGrafico.querySelectorAll("[data-action]").forEach(botao => {
    botao.addEventListener("click", async event => {
        event.stopPropagation();

        const acao = botao.dataset.action;
        fecharMenuGrafico();

        try {
            if (acao === "vincular") {
                await vincularMatrizAoGraficoAtual();
            } else if (acao === "gerar-excel") {
                await exportarGraficoExcel();
            } else if (acao === "abrir-matriz") {
                await abrirMatrizVinculada();
            } else if (acao === "excluir-grafico") {
                await excluirGraficoAtual();
            }
        } catch (error) {
            console.error("Erro no menu do gráfico:", error);
            showToast(`Não foi possível executar a ação: ${error.message}`);
        }
    });
});

// Cada botão do menu salva o papel escolhido.
menuRaci.querySelectorAll("[data-valor]").forEach(botao => {
    botao.addEventListener("click", event => {
        event.stopPropagation();
        salvarPapelRaci(botao.dataset.valor);
    });
});

// Clicar fora fecha o seletor.
document.addEventListener("click", event => {
    if (
        !menuRaci.classList.contains("hidden") &&
        !menuRaci.contains(event.target) &&
        !event.target.closest(".role-badge")
    ) {
        fecharMenuRaci();
    }
});

document.getElementById("ganttSelect").addEventListener(
    "change",
    async event => {
        const cronograma = cronogramasUsuario.find(
            item => String(item.id) === String(event.target.value)
        );

        atualizarEstadoMenuGrafico();

        if (cronograma?.matriz_id) {
            try {
                await carregarDadosRaci(cronograma.matriz_id);
            } catch (error) {
                console.error(error);
                showToast("Não foi possível carregar a matriz vinculada.");
            }
        } else {
            await renderizarGanttVinculado();
        }
    }
);

verificarSessao();