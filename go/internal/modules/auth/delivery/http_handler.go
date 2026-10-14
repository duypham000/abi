package delivery

import (
	"tomo-backend/internal/infrastructure/response"
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/auth/dto"
	"tomo-backend/internal/modules/auth/service"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authService service.AuthService
}

func NewAuthHandler(authService service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request body", err)
		return
	}

	res, err := h.authService.Register(c.Request.Context(), req)
	if err != nil {
		if err == service.ErrUserExists {
			response.BadRequest(c, err.Error(), err)
			return
		}
		response.InternalServerError(c, "Failed to register user", err)
		return
	}

	response.Created(c, "User registered successfully", res)
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid login credentials request", err)
		return
	}
	if req.Email == "" && req.Identifier != "" {
		req.Email = req.Identifier
	}

	res, err := h.authService.Login(c.Request.Context(), req)
	if err != nil {
		if err == service.ErrInvalidCredentials || err == service.ErrUserDisabled {
			response.Unauthorized(c, err.Error())
			return
		}
		response.InternalServerError(c, "Login failed", err)
		return
	}

	response.OK(c, "Login successful", res)
}

func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req dto.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid refresh token request", err)
		return
	}
	if req.RefreshToken == "" && req.RefreshTokenCamel != "" {
		req.RefreshToken = req.RefreshTokenCamel
	}

	res, err := h.authService.RefreshToken(c.Request.Context(), req)
	if err != nil {
		response.Unauthorized(c, "Invalid or expired refresh token")
		return
	}

	response.OK(c, "Token refreshed successfully", res)
}

func (h *AuthHandler) Logout(c *gin.Context) {
	var req dto.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Refresh token is required to logout", err)
		return
	}
	if req.RefreshToken == "" && req.RefreshTokenCamel != "" {
		req.RefreshToken = req.RefreshTokenCamel
	}

	_ = h.authService.Logout(c.Request.Context(), req.RefreshToken)
	response.OK(c, "Logout successful", nil)
}

func (h *AuthHandler) GetMe(c *gin.Context) {
	userIDVal, exists := c.Get(security.CtxUserID)
	if !exists {
		response.Unauthorized(c, "User unauthorized")
		return
	}

	userID := userIDVal.(string)
	profile, err := h.authService.GetProfile(c.Request.Context(), userID)
	if err != nil {
		response.NotFound(c, "User profile not found")
		return
	}

	response.OK(c, "User profile retrieved", profile)
}
