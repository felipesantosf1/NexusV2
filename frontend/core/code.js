
const sidebar = document.getElementById("sidebar");
const toggleSidebar = document.getElementById("toggleSidebar");
const toast = document.getElementById("toast");

const supabaseClient = window.supabaseClient;

let toastTimer;

// MOSTRAR NOTIFICAÇÕES
function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3200);
}

// PREENCHER O PERFIL COM OS DADOS DO SUPABASE
function preencherPerfil(user) {
    const nome =
        user.user_metadata?.username ||
        user.email?.split("@")[0] ||
        "Usuário";

    const email = user.email || "";

    // Atualiza o nome nos dois locais do menu do usuário.
    document
        .querySelectorAll(".profile-copy strong, .dropdown-user strong")
        .forEach(elemento => {
            elemento.textContent = nome;
        });

    // Atualiza o e-mail.
    document
        .querySelectorAll(".profile-copy small, .dropdown-user small")
        .forEach(elemento => {
            elemento.textContent = email;
        });

    // Gera as iniciais a partir do nome.
    const iniciais = nome
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(palavra => palavra[0].toUpperCase())
        .join("") || "U";

    document
        .querySelectorAll(".profile-avatar, .dropdown-user .avatar")
        .forEach(elemento => {
            elemento.textContent = iniciais;
        });
}

// PROTEGER A ÁREA PRINCIPAL
async function verificarSessao() {
    try {
        const { data, error } =
            await supabaseClient.auth.getSession();

        if (error) {
            throw error;
        }

        // Sem sessão ativa, retorna para a tela de login.
        if (!data.session) {
            window.location.replace("../auth/auth_index.html");
            return;
        }

        // Com sessão ativa, apresenta os dados do usuário.
        preencherPerfil(data.session.user);

    } catch (error) {
        console.error("Erro ao verificar a sessão:", error);

        window.location.replace("../auth/auth_index.html");
    }
}

// EXPANDIR E RECOLHER A BARRA LATERAL
toggleSidebar.addEventListener("click", () => {
    const collapsed = sidebar.classList.toggle("collapsed");

    sidebar.classList.toggle("expanded", !collapsed);

    toggleSidebar.innerHTML = collapsed
        ? '<i class="fa-solid fa-bars"></i>'
        : '<i class="fa-solid fa-angles-left"></i>';

    toggleSidebar.setAttribute(
        "aria-label",
        collapsed ? "Expandir menu" : "Recolher menu"
    );
});

// ALTERNAR ENTRE A MATRIZ RACIS E O CRONOGRAMA GANTT
document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll("[data-view]").forEach(item => {
            item.classList.toggle("active", item === button);

            if (item === button) {
                item.setAttribute("aria-current", "page");
            } else {
                item.removeAttribute("aria-current");
            }
        });

        document.querySelectorAll(".view").forEach(view => {
            view.classList.toggle(
                "active",
                view.id === `view-${button.dataset.view}`
            );
        });
    });
});

// AÇÕES DEMONSTRATIVAS E ENCERRAMENTO DE SESSÃO
document.querySelectorAll("[data-demo-action]").forEach(button => {
    if (button.dataset.demoAction === "sair") {
        // O botão Sair agora encerra a sessão real.
        button.addEventListener("click", async () => {
            button.disabled = true;

            try {
                const { error } =
                    await supabaseClient.auth.signOut();

                if (error) {
                    throw error;
                }

                window.location.replace("../auth/auth_index.html");

            } catch (error) {
                console.error("Erro ao sair da conta:", error);

                showToast(
                    "Não foi possível sair da conta. Tente novamente."
                );

                button.disabled = false;
            }
        });

        return;
    }

    // As demais ações continuam como demonstrações.
    button.addEventListener("click", () => {
        showToast(
            "Esta ação será conectada ao backend nas próximas etapas."
        );
    });
});

// CONVITES
document.getElementById("inviteButton").addEventListener("click", () => {
    showToast("O convite será implementado com a API da equipe.");
});

// LISTA DE INTEGRANTES
// O elemento pode ainda não existir no HTML.
document.getElementById("membersButton")?.addEventListener("click", () => {
    showToast("Aqui será exibida a lista real de integrantes.");
});

// SELETOR DE EQUIPE
document.getElementById("teamButton").addEventListener("click", () => {
    showToast(
        "Seletor de equipe — disponível quando o backend estiver integrado."
    );
});

// EXECUTAR A VERIFICAÇÃO DA SESSÃO
verificarSessao();
