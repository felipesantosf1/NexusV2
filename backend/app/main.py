from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Importa as rotas de matrizes (ajuste o caminho se a sua pasta de rotas tiver outro nome, ex: app.routes.matrizes)
from app.routes.matrizes import router as matrizes_router


# Cria a aplicação da API do NexusPM
app = FastAPI(title="NexusPM API")


# Permite que o frontend se comunique com o backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite qualquer origem durante o desenvolvimento
    allow_credentials=False,
    allow_methods=["*"],  # GET, POST, PUT, DELETE etc.
    allow_headers=["*"],
)


# Registra as rotas de matrizes no aplicativo principal
app.include_router(matrizes_router)


# Rota inicial da API
@app.get("/")
def raiz():
    return {"mensagem": "Bem-vindo à API do NexusPM!"}