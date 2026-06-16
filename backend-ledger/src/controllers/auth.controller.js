const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const emailService = require("../services/email.service")
const tokenBlackListModel = require("../models/blackList.model")
const { OAuth2Client } = require("google-auth-library")

function getTokenFromRequest(req) {
    const headerToken = req.headers.authorization?.split(" ")[ 1 ]
    const cookieToken = req.cookies.token

    return headerToken || cookieToken
}

function getGoogleClient() {
    if (!process.env.GOOGLE_CLIENT_ID) {
        return null
    }

    return new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
}

function issueAuthResponse(res, user, statusCode = 200) {
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" })

    res.cookie("token", token)

    return res.status(statusCode).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name,
            role: user.role
        },
        token
    })
}

/**
* - user register controller
* - POST /api/auth/register
*/
async function userRegisterController(req, res) {
    const { email, password, name } = req.body

    const isExists = await userModel.findOne({
        email: email
    })

    if (isExists) {
        return res.status(422).json({
            message: "User already exists with email.",
            status: "failed"
        })
    }

    const user = await userModel.create({
        email,
        password,
        name,
        role: email === process.env.ADMIN_EMAIL ? "ADMIN" : "CUSTOMER"
    })

    issueAuthResponse(res, user, 201)

    await emailService.sendRegistrationEmail(user.email, user.name)
}

/**
 * - User Login Controller
 * - POST /api/auth/login
  */

async function userLoginController(req, res) {
    const { email, password } = req.body

    const user = await userModel.findOne({ email }).select("+password")

    if (!user) {
        return res.status(401).json({
            message: "Email or password is INVALID"
        })
    }

    const isValidPassword = await user.comparePassword(password)

    if (!isValidPassword) {
        return res.status(401).json({
            message: "Email or password is INVALID"
        })
    }

    if (user.authProvider === "google") {
        return res.status(400).json({
            message: "This account uses Google sign-in. Continue with Google instead."
        })
    }

    issueAuthResponse(res, user, 200)

}

async function googleAuthController(req, res) {
    const { credential } = req.body

    if (!credential) {
        return res.status(400).json({
            message: "Google credential is required"
        })
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(500).json({
            message: "Google sign-in is not configured on the server"
        })
    }

    const activeGoogleClient = getGoogleClient()
    const ticket = await activeGoogleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
    })

    const payload = ticket.getPayload()

    if (!payload?.email || !payload?.sub || !payload?.name) {
        return res.status(400).json({
            message: "Invalid Google account payload"
        })
    }

    let user = await userModel.findOne({
        $or: [
            { email: payload.email.toLowerCase() },
            { googleId: payload.sub }
        ]
    })

    const isNewUser = !user

    if (!user) {
        user = await userModel.create({
            email: payload.email.toLowerCase(),
            name: payload.name,
            role: payload.email.toLowerCase() === process.env.ADMIN_EMAIL ? "ADMIN" : "CUSTOMER",
            authProvider: "google",
            googleId: payload.sub
        })
    } else {
        let shouldSave = false

        if (user.authProvider !== "google") {
            user.authProvider = "google"
            shouldSave = true
        }

        if (!user.googleId) {
            user.googleId = payload.sub
            shouldSave = true
        }

        if (shouldSave) {
            await user.save()
        }
    }

    issueAuthResponse(res, user, isNewUser ? 201 : 200)
}

function googleAuthConfigController(req, res) {
    res.status(200).json({
        enabled: Boolean(process.env.GOOGLE_CLIENT_ID),
        clientId: process.env.GOOGLE_CLIENT_ID || ""
    })
}


/**
 * - User Logout Controller
 * - POST /api/auth/logout
  */
async function userLogoutController(req, res) {
    const token = getTokenFromRequest(req)

    if (!token) {
        return res.status(200).json({
            message: "User logged out successfully"
        })
    }



    await tokenBlackListModel.create({
        token: token
    })

    res.clearCookie("token")
    res.clearCookie("token", { httpOnly: true, sameSite: "lax" })

    res.status(200).json({
        message: "User logged out successfully"
    })

}


async function forgotPasswordController(req, res) {
    const { email } = req.body

    if (!email) {
        return res.status(400).json({ message: "Email is required" })
    }

    const user = await userModel.findOne({ email })
    if (!user) {
        return res.status(200).json({ message: "If that email exists in our records, a reset link has been sent." })
    }

    const crypto = require("crypto")
    const token = crypto.randomBytes(20).toString("hex")

    user.resetPasswordToken = token
    user.resetPasswordExpires = Date.now() + 3600000 // 1 hour
    await user.save()

    try {
        await emailService.sendResetPasswordEmail(user.email, user.name, token)
    } catch (error) {
        console.error("Forgot password email failed:", error)
    }

    return res.status(200).json({
        message: "If that email exists in our records, a reset link has been sent."
    })
}

async function resetPasswordController(req, res) {
    const { token, password } = req.body

    if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" })
    }

    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long" })
    }

    const user = await userModel.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: new Date() }
    })

    if (!user) {
        return res.status(400).json({ message: "Password reset token is invalid or has expired." })
    }

    user.password = password
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined
    await user.save()

    return res.status(200).json({
        message: "Password has been reset successfully. You can now login with your new password."
    })
}

module.exports = {
    userRegisterController,
    userLoginController,
    userLogoutController,
    googleAuthController,
    googleAuthConfigController,
    forgotPasswordController,
    resetPasswordController
}
