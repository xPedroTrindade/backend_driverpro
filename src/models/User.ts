import { Schema, model } from "mongoose";

const userSchema = new Schema({
    nome: {
        type: String,
        required: [true, "O nome é obrigatório"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "O email é obrigatório"],
        unique: true,
        lowercase: true,
        trium: true
    },
    passwordHash: {
        type: String,
        required: [true, "A senha é obrigatória"],
        select: false 
    },
    telefone: {
        type: String,
        required: [true, "O telefone é obrigatório"],
    },
    tipo: {
        type: String,
        enum: ["motorista", "passageiro"],
        required: [true, "O tipo de usuário é obrigatório"]
    },
    avatarUrl: { 
    type: String, 
    default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

export default model("User", userSchema);