
const sidebar = document.getElementById("sidebar");
const toggleSidebar = document.getElementById("toggleSidebar");
const toast = document.getElementById("toast");
const supabaseClient = window.supabaseClient;

const seletorMatriz = document.getElementById("matrixSelect-raci");
const tituloMatriz = document.querySelector(
    ".raci-panel .matrix-title-row h2"
);
const tabelaRaci = document.querySelector(".raci-table");
const cabecalhoRaci = tabelaRaci.querySelector("thead");
const corpoRaci = tabelaRaci.querySelector("tbody");

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
    matrizAtualId = matrizId;

    dadosRaci = await requisicaoApi(
        `/matrizes/${matrizId}/raci`
    );

    const opcao = seletorMatriz.selectedOptions[0];

    if (opcao && opcao.value === matrizId) {
        tituloMatriz.textContent = opcao.textContent;
    }

    renderizarRaci();
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
async function editarAtribuicao(tarefa, membro) {
    const atual = dadosRaci.atribuicoes.find(item =>
        item.tarefa_id === tarefa.id &&
        item.membro_id === membro.id
    );

    const resposta = prompt(
        "Digite R, A, C, I ou S. Deixe vazio para remover o papel.",
        atual?.papel || ""
    );

    if (resposta === null) return;

    const papel = resposta.trim().toUpperCase();

    try {
        if (!papel) {
            if (!atual) return;

            await requisicaoApi(
                `/matrizes/${matrizAtualId}/atribuicoes/${tarefa.id}/${membro.id}`,
                { method: "DELETE" }
            );
        } else {
            if (!papeisRaci.includes(papel)) {
                showToast("Use apenas R, A, C, I ou S.");
                return;
            }

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

            botaoPapel.textContent = atribuicao
                ? atribuicao.papel
                : "+";

            botaoPapel.addEventListener("click", () => {
                editarAtribuicao(tarefa, membro);
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
        if (opcao) opcao.textContent = nome;
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
    } else if (acao === "adicionar-tarefa") {
        botao.addEventListener("click", adicionarTarefa);
    } else if (acao === "adicionar-membro") {
        botao.addEventListener("click", adicionarMembro);
    } else {
        botao.addEventListener("click", () => {
            showToast("Esta função será implementada na próxima etapa.");
        });
    }
});

document.getElementById("inviteButton").addEventListener("click", () => {
    showToast("Convites serão implementados em uma próxima etapa.");
});

document.getElementById("teamButton").addEventListener("click", () => {
    showToast("A seleção de equipe será implementada posteriormente.");
});

verificarSessao();
