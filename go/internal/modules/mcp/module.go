package mcp

import (
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/docs/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Module struct {
	Server      *Server
	HTTPHandler *HTTPHandler
}

func InitModule(
	db *gorm.DB,
	docsService service.DocsService,
	canvasService service.CanvasService,
	yjsService service.YjsService,
) *Module {
	srv := NewServer(db, docsService, canvasService, yjsService)
	handler := NewHTTPHandler(srv)
	return &Module{
		Server:      srv,
		HTTPHandler: handler,
	}
}

func (m *Module) RegisterRoutes(rg *gin.RouterGroup, jwtManager *security.JWTManager) {
	mcpGroup := rg.Group("/mcp")
	mcpGroup.Use(security.AuthMiddleware(jwtManager))
	{
		mcpGroup.POST("", m.HTTPHandler.HandlePost)
		mcpGroup.GET("", m.HTTPHandler.HandleGet)
		mcpGroup.DELETE("", m.HTTPHandler.HandleDelete)
	}
}
