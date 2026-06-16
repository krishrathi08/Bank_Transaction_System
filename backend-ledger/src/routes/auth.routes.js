const express = require("express")
const authController = require("../controllers/auth.controller")
const rateLimiter = require("../middleware/rateLimit.middleware")

const router = express.Router()

const authLimiter = rateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    message: "Too many authentication attempts. Please try again in a minute."
})

/* POST /api/auth/register */
router.post("/register", authLimiter, authController.userRegisterController)

/* POST /api/auth/login */
router.post("/login", authLimiter, authController.userLoginController)

/* POST /api/auth/google */
router.post("/google", authLimiter, authController.googleAuthController)

/* GET /api/auth/google/config */
router.get("/google/config", authController.googleAuthConfigController)

/**
 * - POST /api/auth/logout
 */
router.post("/logout", authController.userLogoutController)

/* POST /api/auth/forgot-password */
router.post("/forgot-password", authLimiter, authController.forgotPasswordController)

/* POST /api/auth/reset-password */
router.post("/reset-password", authLimiter, authController.resetPasswordController)



module.exports = router
