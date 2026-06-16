const mongoose = require("mongoose")

const beneficiarySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true
    },
    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: true
    },
    nickname: {
        type: String,
        required: true,
        trim: true
    },
    bankName: {
        type: String,
        trim: true,
        default: "Ledger Bank"
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    }
}, {
    timestamps: true
})

beneficiarySchema.index({ user: 1, account: 1 }, { unique: true })

module.exports = mongoose.model("beneficiary", beneficiarySchema)
