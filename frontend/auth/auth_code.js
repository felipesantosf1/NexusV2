
let toastTimeout = null;

const supabaseClient = window.supabaseClient;


// MOSTRAR OU OCULTAR SENHA
function togglePassword(button) {
    const container = button.closest(".containe_password");
    const input = container.querySelector(".form-input");
    const icon = button.querySelector("i");

    input.type = input.type === "password" ? "text" : "password";

    icon.classList.toggle("fa-eye");
    icon.classList.toggle("fa-eye-slash");
}


// ALTERNAR ENTRE LOGIN, CADASTRO E REDEFINIÇÃO
function switchTab(tab) {
    const forms = {
        login: document.getElementById("loginForm"),
        register: document.getElementById("registerForm"),
        reset: document.getElementById("resetForm")
    };

    Object.entries(forms).forEach(([nome, form]) => {
        form.classList.toggle("active", nome === tab);
    });

    document.getElementById("authTabs").hidden = tab === "reset";

    document.getElementById("tabLoginBtn").classList.toggle(
        "active", tab === "login"
    );

    document.getElementById("tabRegisterBtn").classList.toggle(
        "active", tab === "register"
    );

    const textos = {
        login: ["Acessar NexusPM", "Entre com seu e-mail e senha."],
        register: ["Criar conta", "Cadastre-se para acessar o projeto."],
        reset: ["Redefinir senha", "Escolha uma nova senha para sua conta."]
    };

    document.getElementById("authTitle").textContent = textos[tab][0];
    document.getElementById("authSubtitle").textContent = textos[tab][1];
}


// NOTIFICAÇÕES
function showToast(message, type = "info") {
    const toast = document.getElementById("toast");

    document.getElementById("toastMessage").textContent = message;

    const icons = {
        success: '<i class="fa-solid fa-check"></i>',
        error: '<i class="fa-solid fa-x"></i>',
        warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
        info: '<i class="fa-solid fa-circle-info"></i>'
    };

    document.getElementById("toastIcon").innerHTML = icons[type] || icons.info;

    toast.className = type;
    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(hideToast, 4500);
}

function hideToast() {
    document.getElementById("toast").classList.remove("show");
}

function closePopup() {
    document.getElementById("popup-root")?.classList.remove("active");
}


// MENSAGENS DE ERRO MAIS CLARAS
function mensagemErroAuth(error) {
    const mensagem = (error.message || "").toLowerCase();

    if (mensagem.includes("invalid login credentials")) {
        return "E-mail ou senha incorretos.";
    }

    if (mensagem.includes("email not confirmed")) {
        return "Confirme seu e-mail antes de entrar.";
    }

    if (mensagem.includes("password")) {
        return "Verifique a senha e tente novamente.";
    }

    return error.message || "Não foi possível concluir a operação.";
}


// LOGIN REAL
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const botao = event.submitter;

    botao.disabled = true;

    try {
        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

        if (error) throw error;

        if (!data.session) {
            throw new Error("Não foi possível iniciar a sessão.");
        }

        showToast("Login realizado com sucesso.", "success");

        window.location.replace("../core/index.html");

    } catch (error) {
        showToast(mensagemErroAuth(error), "error");
    } finally {
        botao.disabled = false;
    }
}


// CADASTRO REAL
async function handleRegister(event) {
    event.preventDefault();

    const nome = document.getElementById("regUser").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const confirmacao =
        document.getElementById("regConfirmPassword").value;

    if (!nome) {
        showToast("Informe seu nome de usuário.", "warning");
        return;
    }

    if (password.length < 8) {
        showToast("Use uma senha com pelo menos 8 caracteres.", "warning");
        return;
    }

    if (password !== confirmacao) {
        showToast("As senhas não coincidem.", "error");
        return;
    }

    const botao = event.submitter;
    botao.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username: nome
                },
                emailRedirectTo:
                    new URL("auth_index.html", window.location.href).href
            }
        });

        if (error) throw error;

        if (data.session) {
            showToast("Conta criada com sucesso.", "success");
            window.location.replace("../core/index.html");
            return;
        }

        showToast(
            "Cadastro iniciado. Confira seu e-mail para confirmar a conta.",
            "success"
        );

        document.getElementById("loginEmail").value = email;
        switchTab("login");

    } catch (error) {
        showToast(mensagemErroAuth(error), "error");
    } finally {
        botao.disabled = false;
    }
}


// RECUPERAÇÃO DE SENHA
async function openForgotPassword(event) {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();

    if (!email) {
        showToast(
            "Informe seu e-mail no campo de login primeiro.",
            "warning"
        );
        return;
    }

    const redirectTo =
        `${window.location.origin}${window.location.pathname}?redefinir=1`;

    try {
        const { error } =
            await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo
            });

        if (error) throw error;

        showToast(
            "Se o e-mail puder receber a recuperação, você receberá as instruções.",
            "success"
        );

    } catch (error) {
        showToast(mensagemErroAuth(error), "error");
    }
}


// SALVAR A NOVA SENHA
async function handleUpdatePassword(event) {
    event.preventDefault();

    const password = document.getElementById("newPassword").value;
    const confirmacao =
        document.getElementById("confirmNewPassword").value;

    if (password.length < 8) {
        showToast("Use pelo menos 8 caracteres.", "warning");
        return;
    }

    if (password !== confirmacao) {
        showToast("As senhas não coincidem.", "error");
        return;
    }

    const botao = event.submitter;
    botao.disabled = true;

    try {
        const { data: sessionData } =
            await supabaseClient.auth.getSession();

        if (!sessionData.session) {
            throw new Error(
                "O link expirou. Solicite uma nova recuperação de senha."
            );
        }

        const { error } = await supabaseClient.auth.updateUser({
            password
        });

        if (error) throw error;

        await supabaseClient.auth.signOut();

        history.replaceState(null, "", window.location.pathname);

        document.getElementById("resetForm").reset();

        showToast("Senha alterada. Entre novamente.", "success");
        switchTab("login");

    } catch (error) {
        showToast(mensagemErroAuth(error), "error");
    } finally {
        botao.disabled = false;
    }
}


// VERIFICAR SESSÃO AO ABRIR A PÁGINA
async function iniciarAutenticacao() {
    const redefinindoSenha =
        new URLSearchParams(window.location.search).get("redefinir") === "1";

    if (redefinindoSenha) {
        switchTab("reset");
        return;
    }

    const { data, error } = await supabaseClient.auth.getSession();

    if (!error && data.session) {
        window.location.replace("../core/index.html");
    }
}

document.addEventListener("DOMContentLoaded", iniciarAutenticacao);
