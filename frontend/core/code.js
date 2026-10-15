
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

let fecharDialogoNexusAberto = null;

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

// Cria e controla os campos e as listas personalizados do Nexus.
function garantirDialogoNexus() {
    let overlay = document.getElementById("nexus-dialog-overlay");

    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "nexus-dialog-overlay";
    overlay.className = "nexus-dialog-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
        <section class="nexus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nexus-dialog-title">

            <div class="nexus-dialog-header">
                <div>
                    <h2 id="nexus-dialog-title"></h2>
                    <p id="nexus-dialog-description" hidden></p>
                </div>

                <button type="button"
                    class="nexus-dialog-close"
                    aria-label="Fechar">
                    &times;
                </button>
            </div>

            <form id="nexus-dialog-form" novalidate>
                <label class="nexus-dialog-input-wrap">
                    <span id="nexus-dialog-label">Nome</span>
                    <input id="nexus-dialog-input"
                        type="text"
                        maxlength="150"
                        autocomplete="off"
                        placeholder="Digite um nome">
                </label>

                <p id="nexus-dialog-error"
                    class="nexus-dialog-error"
                    hidden></p>

                <div id="nexus-dialog-options"
                    class="nexus-dialog-options"
                    hidden></div>

                <div class="nexus-dialog-actions">
                    <button type="button"
                        id="nexus-dialog-cancel"
                        class="button secondary-button">
                        Cancelar
                    </button>

                    <button type="submit"
                        id="nexus-dialog-confirm"
                        class="button primary-button">
                        Adicionar
                    </button>
                </div>
            </form>
        </section>
    `;

    document.body.appendChild(overlay);
    return overlay;
}

function abrirDialogoNexus(config = {}) {
    const overlay = garantirDialogoNexus();

    // Fecha um painel anterior, caso ainda esteja aberto.
    if (fecharDialogoNexusAberto) {
        fecharDialogoNexusAberto(null);
    }

    const titulo = overlay.querySelector("#nexus-dialog-title");
    const descricao = overlay.querySelector("#nexus-dialog-description");
    const formulario = overlay.querySelector("#nexus-dialog-form");
    const campo = overlay.querySelector("#nexus-dialog-input");
    const campoRotulo = overlay.querySelector("#nexus-dialog-label");
    const campoContainer = overlay.querySelector(".nexus-dialog-input-wrap");
    const erro = overlay.querySelector("#nexus-dialog-error");
    const lista = overlay.querySelector("#nexus-dialog-options");
    const botaoCancelar = overlay.querySelector("#nexus-dialog-cancel");
    const botaoConfirmar = overlay.querySelector("#nexus-dialog-confirm");
    const botaoFechar = overlay.querySelector(".nexus-dialog-close");
    const painel = overlay.querySelector(".nexus-dialog");

    const temLista = Array.isArray(config.opcoes);

    titulo.textContent = config.titulo || "Adicionar item";
    descricao.textContent = config.descricao || "";
    descricao.hidden = !config.descricao;

    campoRotulo.textContent = config.rotulo || "Nome";
    campo.placeholder = config.placeholder || "Digite um nome";
    campo.value = config.valorInicial || "";
    campo.maxLength = config.maxLength || 150;

    campoContainer.hidden = temLista;
    lista.hidden = !temLista;
    botaoConfirmar.hidden = temLista;
    botaoConfirmar.textContent = config.textoConfirmar || "Adicionar";
    
    erro.hidden = true;
    erro.textContent = "";

    lista.replaceChildren();

    return new Promise(resolve => {
        let finalizado = false;

        function finalizar(valor = null) {
            if (finalizado) return;

            finalizado = true;
            overlay.hidden = true;

            overlay.onclick = null;
            overlay.onkeydown = null;
            formulario.onsubmit = null;
            campo.oninput = null;
            botaoCancelar.onclick = null;
            botaoFechar.onclick = null;

            if (fecharDialogoNexusAberto === finalizar) {
                fecharDialogoNexusAberto = null;
            }

            resolve(valor);
        }

        fecharDialogoNexusAberto = finalizar;

        if (temLista) {
            config.opcoes.forEach(opcao => {
                const botao = document.createElement("button");
                botao.type = "button";
                botao.className = "nexus-dialog-option";

                const texto = document.createElement("span");
                texto.textContent = opcao.texto;

                const seta = document.createElement("span");
                seta.className = "nexus-dialog-arrow";
                seta.textContent = "›";

                botao.append(texto, seta);
                botao.addEventListener("click", () => {
                    finalizar(opcao.valor);
                });

                lista.appendChild(botao);
            });
        }

        formulario.onsubmit = event => {
            event.preventDefault();

            if (temLista) return;

            const valor = campo.value.trim();

            if (!valor) {
                erro.textContent = "Digite um nome para continuar.";
                erro.hidden = false;
                campo.focus();
                return;
            }

            finalizar(valor);
        };

        campo.oninput = () => {
            erro.hidden = true;
        };

        botaoCancelar.onclick = () => finalizar(null);
        botaoFechar.onclick = () => finalizar(null);

        overlay.onclick = event => {
            if (event.target === overlay) finalizar(null);
        };

        overlay.onkeydown = event => {
            if (event.key === "Escape") {
                event.preventDefault();
                finalizar(null);
            }
        };

        overlay.hidden = false;

        // ALTERADO: posiciona o painel perto do botão que o abriu.
        const ancora = config.ancora;

        if (ancora?.isConnected) {
            const retangulo = ancora.getBoundingClientRect();
            const largura = painel.offsetWidth || 380;

            let esquerda = Math.min(
                Math.max(12, retangulo.left),
                window.innerWidth - largura - 12
            );

            let topo = retangulo.bottom + 8;

            if (topo + painel.offsetHeight > window.innerHeight - 12) {
                topo = Math.max(12, retangulo.top - painel.offsetHeight - 8);
            }

            esquerda = Math.max(12, esquerda);

            painel.style.position = "fixed";
            painel.style.left = `${esquerda}px`;
            painel.style.top = `${topo}px`;
        } else {
            painel.style.position = "";
            painel.style.left = "";
            painel.style.top = "";
        }

        if (temLista) {
            lista.querySelector("button")?.focus();
        } else {
            campo.focus();
            campo.select();
        }
    });
}

// CARREGAR MATRIZES DO USUÁRIO
async function carregarMatrizes(idSelecionado = null) {
    const matrizes = await requisicaoApi("/matrizes/");

    seletorMatriz.replaceChildren();

    matrizes.forEach(matriz => {
        const opcao = document.createElement("option");
        opcao.value = matriz.id;
        opcao.textContent = matriz.nome;
        opcao.dataset.isPadrao = String(Boolean(matriz.is_padrao));
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
// BOTÃO DE EXCLUSÃO
function criarBotaoExcluir(rotulo, acao, desabilitado = false) { // #ALTERADO
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "raci-delete-button";

    botao.disabled = desabilitado; // #ALTERADO

    // #ALTERADO: informa por que o botão está desabilitado.
    botao.title = desabilitado
        ? `${rotulo} é um item padrão e não pode ser excluído.`
        : `Excluir ${rotulo}`;

    botao.setAttribute("aria-label", botao.title); // #ALTERADO
    botao.innerHTML = '<i class="fa-solid fa-trash"></i>';

    botao.addEventListener("click", async event => {
        if (botao.disabled) return; // #ALTERADO

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
                    () => excluirMembro(membro),
                    membro.is_padrao
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
                    () => excluirTarefa(tarefa),
                    tarefa.is_padrao
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

// O nome do Gantt sempre é salvo no cronograma,
// independentemente de ele estar vinculado ou não.
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

        const atualizado = await requisicaoApi(
            `/cronogramas/${grafico.id}`,
            {
                method: "PUT",
                body: JSON.stringify({ nome })
            }
        );

        // Atualiza os dados em memória sem modificar a matriz.
        grafico.nome = atualizado.nome;
    },

    async nome => {
        const seletor = document.getElementById("ganttSelect");
        const opcao = seletor.selectedOptions[0];

        if (opcao) {
            opcao.textContent = nome;
        }

        // Re-renderiza usando o nome já atualizado.
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

async function adicionarTarefa(event) {
    const nome = await abrirDialogoNexus({
        titulo: "Nova tarefa",
        descricao: "Adicione uma atividade à matriz RACIS.",
        rotulo: "Nome da tarefa",
        placeholder: "Digite o nome da tarefa",
        textoConfirmar: "Adicionar",
        ancora: event?.currentTarget
    });

    if (nome === null) return;

    const nomeLimpo = nome.trim();

    if (!nomeLimpo) {
        showToast("Informe o nome da tarefa.");
        return;
    }

    if (!matrizAtualId) {
        showToast("Selecione uma matriz antes de criar uma tarefa.");
        return;
    }

    try {
        // Salva a tarefa e recebe o registro criado pela API.
        const criada = await requisicaoApi(
            `/matrizes/${matrizAtualId}/tarefas-raci`,
            {
                method: "POST",
                body: JSON.stringify({ nome: nomeLimpo })
            }
        );

        // Atualiza os dados locais sem consultar novamente a API.
        const novaTarefa = {
            ...criada,
            data_inicio: criada.data_inicio ?? null,
            data_fim: criada.data_fim ?? null,
            status: criada.status ?? "pending"
        };

        dadosRaci.tarefas.push(novaTarefa);

        // Atualiza somente a interface com os dados já recebidos.
        renderizarRaci();

        // Atualiza o Gantt apenas se ele compartilhar esta matriz.
        const seletorGantt = document.getElementById("ganttSelect");

        const graficoAtual = cronogramasUsuario.find(
            grafico =>
                String(grafico.id) === String(seletorGantt.value)
        );

        if (
            graficoAtual?.matriz_id &&
            String(graficoAtual.matriz_id) === String(matrizAtualId)
        ) {
            await renderizarGanttVinculado();
        }

        showToast("Tarefa criada.");
    } catch (error) {
        console.error("Erro ao criar tarefa:", error);
        showToast(`Erro ao criar tarefa: ${error.message}`);
    }
}


// Funciona para Gantt independente ou vinculado.
async function adicionarTarefaGantt(event) {
    const seletor = document.getElementById("ganttSelect");

    const cronograma = cronogramasUsuario.find(
        item => String(item.id) === String(seletor.value)
    );

    if (!cronograma) {
        showToast("Crie ou selecione um gráfico primeiro.");
        return;
    }

    const vinculado = Boolean(cronograma.matriz_id);

    const nome = await abrirDialogoNexus({
        titulo: "Nova tarefa no Gantt",
        descricao: vinculado
            ? "A tarefa também fará parte da matriz RACIS vinculada."
            : "Adicione uma tarefa diretamente a este cronograma.",
        rotulo: "Nome da tarefa",
        placeholder: "Digite o nome da tarefa",
        textoConfirmar: "Adicionar",
        ancora: event?.currentTarget
    });

    if (nome === null) return;

    if (!nome.trim()) {
        showToast("Informe o nome da tarefa.");
        return;
    }

    try {
        if (vinculado) {
            // Gráfico vinculado: tarefa pertence à matriz RACIS.
            await requisicaoApi(
                `/matrizes/${cronograma.matriz_id}/tarefas-raci`,
                {
                    method: "POST",
                    body: JSON.stringify({ nome: nome.trim() })
                }
            );

            await carregarDadosRaci(cronograma.matriz_id);
        } else {
            // Gráfico independente: tarefa pertence ao cronograma.
            await requisicaoApi(
                `/cronogramas/${cronograma.id}/tarefas`,
                {
                    method: "POST",
                    body: JSON.stringify({ nome: nome.trim() })
                }
            );

            await renderizarGanttVinculado();
        }

        showToast("Tarefa criada.");
    } catch (error) {
        showToast(`Erro ao criar tarefa: ${error.message}`);
    }
}

// CRIAR MEMBRO
async function adicionarMembro(event) {
    // Campo personalizado junto ao botão Membro.
    const nome = await abrirDialogoNexus({
        titulo: "Adicionar membro",
        descricao: "Informe o nome do integrante da matriz.",
        rotulo: "Nome do membro",
        placeholder: "Digite o nome do membro",
        textoConfirmar: "Adicionar",
        ancora: event?.currentTarget
    });

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

    // Identifica a matriz padrão selecionada.
    const opcaoMatrizAtual = [...seletorMatriz.options].find(
        opcao => String(opcao.value) === String(matrizAtualId)
    );

    const matrizPadrao = opcaoMatrizAtual?.dataset.isPadrao === "true";

    // Desabilita a exclusão da matriz padrão.
    const botaoExcluirMatriz = menuMatriz.querySelector(
        '[data-action="delete"]'
    );

    botaoExcluirMatriz.disabled = !opcaoMatrizAtual || matrizPadrao;

    botaoExcluirMatriz.title = matrizPadrao
        ? "A matriz padrão não pode ser excluída."
        : "Excluir matriz";

    menuMatriz.dataset.hasCronograma = vinculado ? "true" : "false";

    const botaoVincular = menuMatriz.querySelector(
        '[data-action="vincular"]'
    );

    // Impede desvincular o Gantt da matriz padrão.
    botaoVincular.disabled = !opcaoMatrizAtual;

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

    // Prioriza o gráfico informado, como um gráfico recém-criado.
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

    const graficoPadrao = Boolean(grafico?.is_padrao || grafico?.matriz_is_padrao);

    // Permite vincular ou desvincular qualquer gráfico existente.
    botaoVincular.disabled = !grafico;

    // O Gantt padrão continua protegido contra exclusão.
    botaoExcluir.disabled = !grafico || graficoPadrao; 

    botaoExcluir.title = graficoPadrao
        ? "O gráfico padrão não pode ser excluído."
        : "Excluir gráfico";

    botaoVincular.querySelector("span").textContent =
        grafico?.matriz_id
            ? "Desvincular matriz RACIS"
            : "Vincular matriz RACIS";

    botaoAbrir.hidden = !grafico?.matriz_id;
}

async function criarGraficoGantt(event) {
    // Campo personalizado junto ao botão Novo gráfico.
    const nome = await abrirDialogoNexus({
        titulo: "Novo gráfico Gantt",
        descricao: "Crie um cronograma para organizar as atividades do projeto.",
        rotulo: "Nome do gráfico",
        placeholder: "Digite o nome do gráfico",
        textoConfirmar: "Criar gráfico",
        ancora: event?.currentTarget
    });

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

    // Impede excluir o Gantt padrão mesmo por chamada direta.
    if (grafico.is_padrao || grafico.matriz_is_padrao) {
        showToast("O gráfico padrão não pode ser excluído.");
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

        // Lista clicável.
        const matrizSelecionadaId = await abrirDialogoNexus({
            titulo: "Vincular matriz RACIS",
            descricao: `Selecione a matriz que será vinculada a "${grafico.nome}".`,
            opcoes: disponiveis.map(matriz => ({
                valor: String(matriz.id),
                texto: matriz.nome
            })),
            ancora: botaoMenuGrafico
        });

        if (matrizSelecionadaId === null) return;

        const matrizSelecionada = disponiveis.find(
            matriz => String(matriz.id) === matrizSelecionadaId
        );

        if (!matrizSelecionada) return;

        await requisicaoApi(
            `/cronogramas/${grafico.id}/vinculo`,
            {
                method: "PUT",
                body: JSON.stringify({
                    matriz_id: matrizSelecionada.id
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

    try {
        let tarefas = [];
        let membros = [];
        let atribuicoes = [];

        // Busca tarefas próprias ou tarefas da matriz vinculada.
        if (grafico.matriz_id) {
            const raci =
                String(grafico.matriz_id) === String(matrizAtualId)
                    ? dadosRaci
                    : await requisicaoApi(
                        `/matrizes/${grafico.matriz_id}/raci`
                    );

            tarefas = raci.tarefas || [];
            membros = raci.membros || [];
            atribuicoes = raci.atribuicoes || [];
        } else {
            tarefas = await requisicaoApi(
                `/cronogramas/${grafico.id}/tarefas`
            );
        }

        // Cabeçalho principal da planilha.
        const linhas = [[
            "Tarefa / Atividade",
            "Data de início",
            "Data de término",
            "Status",
            ...membros.map(membro => membro.nome)
        ]];

        tarefas.forEach(tarefa => {
            const linha = [
                tarefa.nome,
                tarefa.data_inicio
                    ? formatarDataGantt(tarefa.data_inicio)
                    : "Não definida",
                tarefa.data_fim
                    ? formatarDataGantt(tarefa.data_fim)
                    : "Não definida",
                rotuloStatusGantt(tarefa.status)
            ];

            // Mantém as atribuições RACIS quando houver vínculo.
            membros.forEach(membro => {
                const atribuicao = atribuicoes.find(item =>
                    String(item.tarefa_id) === String(tarefa.id) &&
                    String(item.membro_id) === String(membro.id)
                );

                linha.push(atribuicao?.papel || "-");
            });

            linhas.push(linha);
        });

        const planilha = XLSX.utils.aoa_to_sheet(linhas);

        // Larguras adequadas para leitura dos campos.
        planilha["!cols"] = [
            { wch: 45 },
            { wch: 16 },
            { wch: 16 },
            { wch: 18 },
            ...membros.map(() => ({ wch: 20 }))
        ];

        // Congela o cabeçalho durante a rolagem.
        planilha["!freeze"] = {
            xSplit: 0,
            ySplit: 1
        };

        const livro = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            livro,
            planilha,
            "Cronograma Gantt"
        );

        const nomeArquivo = (grafico.nome || "Cronograma_Gantt")
            .replace(/[\\/:*?"<>|]/g, "_");

        XLSX.writeFile(livro, `${nomeArquivo}.xlsx`);

        showToast("Cronograma exportado para Excel.");
    } catch (error) {
        console.error("Erro ao exportar cronograma:", error);
        showToast(`Não foi possível exportar: ${error.message}`);
    }
}

// Converte o valor salvo para um status conhecido.
function normalizarStatusGantt(status) {
    const valor = String(status || "pending").toLowerCase();

    if (["done", "completed", "concluída", "concluida"].includes(valor)) {
        return "done";
    }

    if (["in_progress", "em andamento", "andamento"].includes(valor)) {
        return "in_progress";
    }

    return "pending";
}

// Rótulos em português para o seletor e as linhas.
function rotuloStatusGantt(status) {
    const valor = normalizarStatusGantt(status);

    if (valor === "done") return "Concluída";
    if (valor === "in_progress") return "Em andamento";

    return "Pendente";
}

// Cria uma linha de duração posicionada na escala JAN–DEZ.
function adicionarBarraDataGantt(linhaTempo, tarefa) {
    if (!tarefa.data_inicio || !tarefa.data_fim) return;

    const [anoInicio, mesInicio, diaInicio] =
        tarefa.data_inicio.split("-").map(Number);

    const [anoFim, mesFim, diaFim] =
        tarefa.data_fim.split("-").map(Number);

    const inicio = Date.UTC(anoInicio, mesInicio - 1, diaInicio);
    const fim = Date.UTC(anoFim, mesFim - 1, diaFim);

    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) {
        return;
    }

    const inicioAno = Date.UTC(anoInicio, 0, 1);
    const proximoAno = Date.UTC(anoInicio + 1, 0, 1);
    const diasNoAno = (proximoAno - inicioAno) / 86400000;

    // A escala atual do gráfico exibe janeiro a dezembro.
    if (inicio >= proximoAno) return;

    // Se o prazo passar do fim do ano, a barra é cortada em dezembro.
    const fimVisivel = Math.min(fim, proximoAno);

    const esquerda = ((inicio - inicioAno) / 86400000) / diasNoAno * 100;
    let direita = ((fimVisivel - inicioAno) / 86400000) / diasNoAno * 100;

    // Uma tarefa que começa e termina no mesmo dia ainda terá uma barra.
    if (direita <= esquerda) {
        direita = esquerda + (100 / diasNoAno);
    }

    direita = Math.min(100, direita);

    const barra = document.createElement("span");
    const status = normalizarStatusGantt(tarefa.status);

    barra.className = `gantt-date-bar bar-${{
        done: "done",
        in_progress: "progress",
        pending: "pending"
    }[status]}`;

    barra.style.left = `${esquerda}%`;
    barra.style.width = `${Math.max(0, direita - esquerda)}%`;

    barra.title =
        `${tarefa.nome}: ${formatarDataGantt(tarefa.data_inicio)} a ` +
        `${formatarDataGantt(tarefa.data_fim)} — ${rotuloStatusGantt(status)}`;

    barra.setAttribute("aria-label", barra.title);

    linhaTempo.appendChild(barra);
}

// Apresenta as datas no formato brasileiro.
function formatarDataGantt(data) {
    if (!data) return "Sem data";

    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano}`;
}

// Abre o editor de datas e status da tarefa.
function abrirEditorPlanejamentoGantt(tarefa) {
    return new Promise(resolve => {
        const dialogo = document.createElement("dialog");
        dialogo.className = "gantt-schedule-dialog";

        dialogo.innerHTML = `
            <form class="gantt-schedule-form">
                <h2>Planejamento da tarefa</h2>

                <label>
                    Data inicial
                    <input type="date" name="data_inicio">
                </label>

                <label>
                    Data final
                    <input type="date" name="data_fim">
                </label>

                <label>
                    Status
                    <select name="status">
                        <option value="pending">Pendente</option>
                        <option value="in_progress">Em andamento</option>
                        <option value="done">Concluída</option>
                    </select>
                </label>

                <p class="gantt-schedule-error" hidden></p>

                <div class="gantt-schedule-actions">
                    <button type="button" class="button secondary-button">
                        Cancelar
                    </button>

                    <button type="submit" class="button primary-button">
                        Salvar
                    </button>
                </div>
            </form>
        `;

        document.body.appendChild(dialogo);

        const formulario = dialogo.querySelector("form");
        const inicio = formulario.elements.data_inicio;
        const fim = formulario.elements.data_fim;
        const status = formulario.elements.status;
        const erro = dialogo.querySelector(".gantt-schedule-error");

        inicio.value = tarefa.data_inicio || "";
        fim.value = tarefa.data_fim || "";
        status.value = normalizarStatusGantt(tarefa.status);

        let finalizado = false;

        function finalizar(resultado) {
            if (finalizado) return;

            finalizado = true;

            if (dialogo.open) dialogo.close();
            dialogo.remove();

            resolve(resultado);
        }

        formulario.querySelector(
            'button[type="button"]'
        ).addEventListener("click", () => finalizar(null));

        dialogo.addEventListener("cancel", event => {
            event.preventDefault();
            finalizar(null);
        });

        formulario.addEventListener("submit", event => {
            event.preventDefault();

            if (Boolean(inicio.value) !== Boolean(fim.value)) {
                erro.textContent = "Preencha as duas datas ou deixe ambas vazias.";
                erro.hidden = false;
                return;
            }

            if (inicio.value && fim.value < inicio.value) {
                erro.textContent = "A data final deve ser igual ou posterior à inicial.";
                erro.hidden = false;
                return;
            }

            finalizar({
                data_inicio: inicio.value || null,
                data_fim: fim.value || null,
                status: status.value
            });
        });

        dialogo.showModal();
    });
}

// Salva datas/status conforme o Gantt seja independente ou vinculado.
async function editarPlanejamentoGantt(tarefa, cronograma) {
    const planejamento = await abrirEditorPlanejamentoGantt(tarefa);

    if (!planejamento) return;

    try {
        const endpoint = cronograma.matriz_id
            ? `/matrizes/${cronograma.matriz_id}/tarefas-raci/${tarefa.id}/planejamento`
            : `/cronogramas/${cronograma.id}/tarefas/${tarefa.id}/planejamento`;

        await requisicaoApi(endpoint, {
            method: "PATCH",
            body: JSON.stringify(planejamento)
        });

        tarefa.data_inicio = planejamento.data_inicio;
        tarefa.data_fim = planejamento.data_fim;
        tarefa.status = planejamento.status;

        if (
            cronograma.matriz_id &&
            String(matrizAtualId) === String(cronograma.matriz_id)
        ) {
            await carregarDadosRaci(cronograma.matriz_id);
        } else {
            await renderizarGanttVinculado();
        }

        showToast("Datas e status atualizados.");
    } catch (error) {
        showToast(`Erro ao atualizar planejamento: ${error.message}`);
    }
}

// Salva o status diretamente na linha da tarefa.
async function salvarStatusGantt(tarefa, cronograma, novoStatus, seletor) {
    const statusAnterior = normalizarStatusGantt(tarefa.status);

    seletor.disabled = true;

    try {
        const endpoint = cronograma.matriz_id
            ? `/matrizes/${cronograma.matriz_id}/tarefas-raci/${tarefa.id}/planejamento`
            : `/cronogramas/${cronograma.id}/tarefas/${tarefa.id}/planejamento`;

        const atualizada = await requisicaoApi(endpoint, {
            method: "PATCH",
            body: JSON.stringify({
                data_inicio: tarefa.data_inicio || null,
                data_fim: tarefa.data_fim || null,
                status: novoStatus
            })
        });

        tarefa.status = atualizada.status;

        if (
            cronograma.matriz_id &&
            String(matrizAtualId) === String(cronograma.matriz_id)
        ) {
            await carregarDadosRaci(cronograma.matriz_id);
        } else {
            await renderizarGanttVinculado();
        }

        showToast("Status atualizado.");
    } catch (error) {
        seletor.value = statusAnterior;
        showToast(`Erro ao alterar status: ${error.message}`);
    } finally {
        seletor.disabled = false;
    }
}

// Botão de calendário ao lado de cada tarefa.
function criarBotaoPlanejamentoGantt(tarefa, cronograma) {
    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "gantt-task-schedule";
    botao.title = "Definir datas e status";
    botao.setAttribute("aria-label", botao.title);
    botao.innerHTML = '<i class="fa-regular fa-calendar-days"></i>';

    botao.addEventListener("click", () => {
        editarPlanejamentoGantt(tarefa, cronograma);
    });

    return botao;
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

        // Alinha a grade à altura da tarefa correspondente.
        linhaTempo.style.height = `${linha.offsetHeight}px`;

        timeline.appendChild(linhaTempo);
    }

    const vinculado = Boolean(cronograma?.matriz_id);

    if (tituloGantt) {
        tituloGantt.textContent = cronograma?.nome || "Cronograma Gantt";
    }

    // Mostra o nome da matriz, não o nome do gráfico.
    if (tituloContexto) {
        tituloContexto.textContent = vinculado
            ? `Cronograma vinculado à matriz "${cronograma.matriz_nome}"`
            : "Cronograma independente";
    }

    // Os nomes são independentes; somente as tarefas são compartilhadas.
    if (descricaoContexto) {
        descricaoContexto.textContent = vinculado
            ? "As tarefas são compartilhadas com a matriz RACIS."
            : "Este cronograma funciona de forma independente.";
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

    // NOVO: carrega tarefas próprias quando o Gantt é independente.
    if (!cronograma.matriz_id) {
        let tarefasIndependentes;

        try {
            tarefasIndependentes = await requisicaoApi(
                `/cronogramas/${cronograma.id}/tarefas`
            );
        } catch (error) {
            if (versao !== versaoRenderGantt) return;

            console.error("Erro ao carregar tarefas do Gantt:", error);
            adicionarLinhaVazia(
                "Erro ao carregar tarefas",
                "Tente novamente"
            );
            return;
        }

        if (versao !== versaoRenderGantt) return;

        if (!tarefasIndependentes.length) {
            adicionarLinhaVazia(
                "Nenhuma tarefa cadastrada",
                "Use Nova tarefa para adicionar"
            );
            return;
        }

        tarefasIndependentes.forEach((tarefa, indice) => {
            const linha = document.createElement("div");
            linha.className = "gantt-task-row";

            const grupo = document.createElement("span");
            grupo.className = "gantt-task-name-group";

            const numero = document.createElement("b");
            numero.textContent = String(indice + 1).padStart(2, "0");

            const nomeTarefa = document.createElement("span");
            nomeTarefa.textContent = tarefa.nome;
            nomeTarefa.title = "Dê dois cliques para renomear";

            grupo.append(numero, nomeTarefa);
            linha.appendChild(grupo);

            const acoes = document.createElement("div");
            acoes.className = "gantt-task-row-actions";

            // Exibe status em português.
            const status = document.createElement("small");
            status.textContent = rotuloStatusGantt(tarefa.status);
            acoes.appendChild(status);

            // Botão para editar datas e status.
            acoes.appendChild(criarBotaoPlanejamentoGantt(tarefa, cronograma));

            const botaoExcluir = document.createElement("button");
            botaoExcluir.type = "button";
            botaoExcluir.className = "gantt-task-delete";
            botaoExcluir.title = tarefa.is_padrao
                ? "A tarefa padrão não pode ser excluída."
                : "Excluir tarefa";
            botaoExcluir.setAttribute("aria-label", botaoExcluir.title);
            botaoExcluir.disabled = Boolean(tarefa.is_padrao);
            botaoExcluir.innerHTML =
                '<i class="fa-solid fa-trash" aria-hidden="true"></i>';

            botaoExcluir.addEventListener("click", async () => {
                if (tarefa.is_padrao) return;

                if (!confirm(`Excluir a tarefa "${tarefa.nome}"?`)) return;

                try {
                    await requisicaoApi(
                        `/cronogramas/${cronograma.id}/tarefas/${tarefa.id}`,
                        { method: "DELETE" }
                    );

                    await renderizarGanttVinculado();
                    showToast("Tarefa excluída.");
                } catch (error) {
                    showToast(`Erro ao excluir tarefa: ${error.message}`);
                }
            });

            acoes.appendChild(botaoExcluir);
            linha.appendChild(acoes);
            colunaTarefas.appendChild(linha);

            const linhaTempo = document.createElement("div");
            linhaTempo.className = "gantt-grid-row";

            // Alinha a grade à altura da tarefa correspondente.
            linhaTempo.style.height = `${linha.offsetHeight}px`;

            timeline.appendChild(linhaTempo);

            // Desenha a barra de acordo com o intervalo definido.
            adicionarBarraDataGantt(linhaTempo, tarefa);

            // ALTERADO: salva o nome e atualiza a linha imediatamente.
            ativarEdicaoDuploClique(
                async novoNome => {
                    // Recebe a tarefa atualizada e mantém a memória sincronizada.
                    const tarefaAtualizada = await requisicaoApi(
                        `/cronogramas/${cronograma.id}/tarefas/${tarefa.id}`,
                        {
                            method: "PUT",
                            body: JSON.stringify({ nome: novoNome })
                        }
                    );

                    tarefa.nome = tarefaAtualizada.nome;
                },
            );
        });

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
        grupo.className = "gantt-task-name-group";

        const numero = document.createElement("b");
        numero.textContent = String(indice + 1).padStart(2, "0");

        const nomeTarefa = document.createElement("span");
        nomeTarefa.className = "gantt-task-name";
        nomeTarefa.textContent = tarefa.nome;
        nomeTarefa.title = `${tarefa.nome}\nDê dois cliques para renomear`;

        grupo.append(numero, nomeTarefa);
        linha.appendChild(grupo);

        // Agrupa o status e o botão de exclusão.
        const acoes = document.createElement("div");
        acoes.className = "gantt-task-row-actions";

        // Mostra o status real da tarefa.
        const status = document.createElement("select");
        status.className = "gantt-task-status";
        status.setAttribute("aria-label", `Status da tarefa ${tarefa.nome}`);

        status.innerHTML = `
            <option value="pending">Pendente</option>
            <option value="in_progress">Em andamento</option>
            <option value="done">Concluída</option>
        `;

        status.value = normalizarStatusGantt(tarefa.status);

        status.addEventListener("change", () => {
            salvarStatusGantt(tarefa, cronograma, status.value, status);
        });

        acoes.appendChild(status);

        // Botão para editar datas e status.
        acoes.appendChild(criarBotaoPlanejamentoGantt(tarefa, cronograma));

        const botaoExcluir = document.createElement("button");
        botaoExcluir.type = "button";
        botaoExcluir.className = "gantt-task-delete";
        botaoExcluir.disabled = Boolean(tarefa.is_padrao);
        botaoExcluir.title = tarefa.is_padrao
            ? "A tarefa padrão não pode ser excluída."
            : "Excluir tarefa";
        botaoExcluir.setAttribute("aria-label", botaoExcluir.title);
        botaoExcluir.innerHTML =
            '<i class="fa-solid fa-trash" aria-hidden="true"></i>';

        botaoExcluir.addEventListener("click", async () => {
            if (tarefa.is_padrao) return;

            if (!confirm(`Excluir a tarefa "${tarefa.nome}"?`)) return;

            try {
                await requisicaoApi(
                    `/matrizes/${cronograma.matriz_id}/tarefas-raci/${tarefa.id}`,
                    { method: "DELETE" }
                );

                if (String(matrizAtualId) === String(cronograma.matriz_id)) {
                    await carregarDadosRaci(cronograma.matriz_id);
                } else {
                    await renderizarGanttVinculado();
                }

                showToast("Tarefa excluída.");
            } catch (error) {
                showToast(`Erro ao excluir tarefa: ${error.message}`);
            }
        });

        acoes.appendChild(botaoExcluir);
        linha.appendChild(acoes);

        colunaTarefas.appendChild(linha);

        // Uma linha temporal correspondente a cada tarefa.
        const linhaTempo = document.createElement("div");
        linhaTempo.className = "gantt-grid-row";

        // Alinha a grade à altura da tarefa correspondente.
        linhaTempo.style.height = `${linha.offsetHeight}px`;

        timeline.appendChild(linhaTempo);

        adicionarBarraDataGantt(linhaTempo, tarefa);

        // Renomear no Gantt também altera a tarefa da matriz.
        ativarEdicaoDuploClique(
            nomeTarefa,

            async novoNome => {
                // Recebe a tarefa atualizada e mantém a memória sincronizada.
                const tarefaAtualizada = await requisicaoApi(
                    `/matrizes/${cronograma.matriz_id}/tarefas-raci/${tarefa.id}`,
                    {
                        method: "PUT",
                        body: JSON.stringify({ nome: novoNome })
                    }
                );

                tarefa.nome = tarefaAtualizada.nome;
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
    // #ALTERADO: proteção adicional para a matriz padrão.
    const matrizSelecionada = seletorMatriz.selectedOptions[0];

    if (matrizSelecionada?.dataset.isPadrao === "true") {
        showToast("A matriz padrão não pode ser excluída.");
        return;
    }

    const nome = matrizSelecionada?.textContent || "esta matriz";

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

    if (disponiveis.length > 0) { // #ALTERADO
        // #ALTERADO: apresenta os cronogramas disponíveis em uma lista clicável.
        const cronogramaSelecionadoId = await abrirDialogoNexus({
            titulo: "Vincular gráfico Gantt", // #ALTERADO
            descricao: `Selecione o gráfico que será vinculado à matriz "${tituloMatriz.textContent}".`, // #ALTERADO
            opcoes: disponiveis.map(item => ({ // #ALTERADO
                valor: String(item.id), // #ALTERADO
                texto: item.nome // #ALTERADO
            })), // #ALTERADO
            ancora: botaoMenuMatriz // #ALTERADO
        }); // #ALTERADO

        if (cronogramaSelecionadoId === null) return; // #ALTERADO

        // #ALTERADO: guarda o cronograma escolhido para a requisição seguinte.
        cronograma = disponiveis.find(
            item => String(item.id) === cronogramaSelecionadoId
        ); // #ALTERADO

        if (!cronograma) return; // #ALTERADO
    } else { // #ALTERADO
        // #ALTERADO: abre o painel para criar um cronograma quando não há opções.
        const nome = await abrirDialogoNexus({
            titulo: "Criar gráfico Gantt", // #ALTERADO
            descricao: "Não há gráficos livres para vincular. Crie um novo gráfico para esta matriz.", // #ALTERADO
            rotulo: "Nome do gráfico", // #ALTERADO
            placeholder: "Digite o nome do gráfico", // #ALTERADO
            valorInicial: `${tituloMatriz.textContent} - Cronograma`, // #ALTERADO
            textoConfirmar: "Criar e vincular", // #ALTERADO
            ancora: botaoMenuMatriz // #ALTERADO
        }); // #ALTERADO

        if (nome === null) return; // #ALTERADO

        // #ALTERADO: armazena o cronograma criado na mesma variável.
        cronograma = await requisicaoApi("/cronogramas/", {
            method: "POST",
            body: JSON.stringify({ nome: nome.trim() })
        }); // #ALTERADO
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

    // Normaliza os IDs e ignora cronogramas independentes.
    const cronograma = cronogramasUsuario.find(
        item =>
            item.matriz_id != null &&
            String(item.matriz_id) === String(matrizAtualId)
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
            // Campo personalizado junto ao botão Nova matriz.
            const nome = await abrirDialogoNexus({
                titulo: "Nova matriz RACIS",
                descricao: "Crie uma matriz para organizar as responsabilidades do projeto.",
                rotulo: "Nome da matriz",
                placeholder: "Digite o nome da matriz",
                textoConfirmar: "Criar matriz",
                ancora: botao
            });

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