from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Importa as rotas 
from app.routes.matrizes import router as matrizes_router
from app.routes.raci import router as raci_router
from app.routes.cronogramas import router as cronogramas_router

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
app.include_router(raci_router)
app.include_router(cronogramas_router)


# Rota inicial da API
@app.get("/")
def raiz():
    return {"mensagem": "Bem-vindo à API do NexusPM!"}