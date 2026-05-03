# 🚗 DriverPro

Sistema de gestão de mobilidade e logística para motoristas, desenvolvido com uma arquitetura moderna separando o frontend mobile do backend escalável.

## 📌 Sobre o Projeto
O DriverPro permite que motoristas giram as suas corridas, acompanhem lucros, recebam notificações em tempo real e controlem a sua disponibilidade, tudo integrado com uma base de dados MongoDB Atlas.

---

## 🛠️ Tecnologias Utilizadas

### **Frontend**
- **React Native** (Expo)
- **NativeWind** (Tailwind CSS para Mobile)
- **TypeScript**
- **React Navigation**

### **Backend**
- **Node.js** com **Express**
- **TypeScript 6.0**
- **Mongoose** (Modelagem de dados)
- **MongoDB Atlas** (Base de dados em nuvem)
- **CORS** & **Dotenv**

---

## 🏗️ Estrutura do Backend (Padrões de Mercado)
O backend segue a **Layered Architecture** (Arquitetura em Camadas) para facilitar a manutenção:

- `src/models`: Definição dos Schemas e Hooks do Mongoose.
- `src/repositories`: Camada de comunicação direta com o banco de dados.
- `src/services`: Regras de negócio e tratamentos de dados.
- `src/config`: Configurações de conexão e variáveis de ambiente.

---

## 🚀 Como Executar o Projeto

### 1. Clonar o Repositório
```bash
git clone [https://github.com/seu-usuario/driverpro.git](https://github.com/seu-usuario/driverpro.git)
cd driverpro
