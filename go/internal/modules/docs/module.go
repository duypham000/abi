package docs

import (
	"tomo-backend/internal/infrastructure/security"
	"tomo-backend/internal/modules/docs/delivery"
	"tomo-backend/internal/modules/docs/domain"
	"tomo-backend/internal/modules/docs/repository"
	"tomo-backend/internal/modules/docs/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Module struct {
	DocRepo       repository.DocRepository
	RevRepo       repository.RevisionRepository
	YjsRepo       repository.YjsRepository
	DocsService   service.DocsService
	YjsService    service.YjsService
	DocsHandler   *delivery.DocsHandler
	YjsHandler    *delivery.YjsHandler
	SeriesHandler *delivery.SeriesHandler
}

func InitModule(db *gorm.DB, yjsSecret string, wsURL ...string) *Module {
	// Auto migrate entities
	_ = db.AutoMigrate(&domain.Doc{}, &domain.DocRevision{}, &domain.YjsUpdate{}, &domain.Series{})

	docRepo := repository.NewDocRepository(db)
	revRepo := repository.NewRevisionRepository(db)
	yjsRepo := repository.NewYjsRepository(db)

	docsService := service.NewDocsService(docRepo, revRepo)
	yjsService := service.NewYjsService(docRepo, yjsRepo, revRepo, yjsSecret, wsURL...)

	docsHandler := delivery.NewDocsHandler(docsService)
	yjsHandler := delivery.NewYjsHandler(yjsService)
	seriesHandler := delivery.NewSeriesHandler(db)

	return &Module{
		DocRepo:       docRepo,
		RevRepo:       revRepo,
		YjsRepo:       yjsRepo,
		DocsService:   docsService,
		YjsService:    yjsService,
		DocsHandler:   docsHandler,
		YjsHandler:    yjsHandler,
		SeriesHandler: seriesHandler,
	}
}

func (m *Module) RegisterRoutes(router *gin.RouterGroup, jwtManager *security.JWTManager) {
	// Series endpoints (registered at both /series and /base/series for compatibility)
	registerSeriesRoutes := func(g *gin.RouterGroup) {
		sg := g.Group("/series")
		sg.Use(security.AuthMiddleware(jwtManager))
		{
			sg.GET("", m.SeriesHandler.ListSeries)
			sg.GET("/list", m.SeriesHandler.ListSeries)
			sg.GET("/search", m.SeriesHandler.SearchSeries)
			sg.GET("/:id", m.SeriesHandler.GetSeriesByID)
			sg.POST("", m.SeriesHandler.CreateSeries)
			sg.PUT("/:id", m.SeriesHandler.UpdateSeries)
			sg.DELETE("/:id", m.SeriesHandler.DeleteSeries)
		}
	}

	registerSeriesRoutes(router)

	// Docs endpoints
	docsGroup := router.Group("/docs")
	{
		// Public or slug read
		docsGroup.GET("/slug/:slug", m.DocsHandler.GetDocBySlug)

		// Authenticated Docs routes
		protected := docsGroup.Group("")
		protected.Use(security.AuthMiddleware(jwtManager))
		{
			protected.POST("", m.DocsHandler.CreateDoc)
			protected.GET("", m.DocsHandler.ListDocs)
			protected.GET("/list", m.DocsHandler.ListDocs)
			protected.GET("/lazy", m.DocsHandler.ListDocs)
			protected.GET("/search", m.DocsHandler.ListDocs)
			protected.GET("/tree", m.DocsHandler.GetDocTree)
			protected.GET("/:id", m.DocsHandler.GetDocByID)
			protected.PUT("/:id", m.DocsHandler.UpdateDoc)
			protected.DELETE("/:id", m.DocsHandler.DeleteDoc)
			protected.GET("/:id/revisions", m.DocsHandler.GetRevisions)
		}
	}

	// Yjs Real-time Collaboration & Storage endpoints
	yjsGroup := router.Group("/yjs")
	{
		// Yjs Token & Perm
		yjsGroup.GET("/auth/perm", m.YjsHandler.CheckPermission)
		yjsGroup.GET("/auth/perm/:room/:userid", m.YjsHandler.CheckPermCallback)

		// Internal endpoints for tomo-node integration (binary protocol)
		internalGroup := yjsGroup.Group("/internal")
		{
			// Binary snapshot endpoints (javaStorage.js protocol)
			internalGroup.GET("/docs/:docId/snapshot", m.YjsHandler.GetInternalSnapshot)
			internalGroup.PUT("/docs/:docId/snapshot", m.YjsHandler.PutInternalSnapshot)
			internalGroup.GET("/docs/:docId/state-vector", m.YjsHandler.GetInternalStateVector)
			// Canvas binary snapshot endpoints
			internalGroup.GET("/canvases/:docId/snapshot", m.YjsHandler.GetInternalSnapshot)
			internalGroup.PUT("/canvases/:docId/snapshot", m.YjsHandler.PutInternalSnapshot)
			internalGroup.GET("/canvases/:docId/state-vector", m.YjsHandler.GetInternalStateVector)
			// JSON endpoints (revisions, meta)
			internalGroup.POST("/docs/:docId/snapshot", m.YjsHandler.SaveSnapshot)
			internalGroup.GET("/docs/:docId/revisions/head", m.YjsHandler.GetRevisionHead)
			internalGroup.POST("/docs/:docId/revisions", m.YjsHandler.AppendInternalRevision)
			internalGroup.GET("/docs/:docId/revisions/:revisionId/chain", m.YjsHandler.GetRevisionChain)
			internalGroup.POST("/docs/:docId/meta", m.YjsHandler.UpdateDocMeta)
		}

		protectedYjs := yjsGroup.Group("")
		protectedYjs.Use(security.AuthMiddleware(jwtManager))
		{
			protectedYjs.POST("/auth/token", m.YjsHandler.GenerateToken)
			protectedYjs.GET("/auth/token", m.YjsHandler.GenerateToken)
			protectedYjs.POST("/token", m.YjsHandler.GenerateToken)
			protectedYjs.GET("/token", m.YjsHandler.GenerateToken)
			protectedYjs.POST("/storage/doc/:docId/update", m.YjsHandler.SaveUpdate)
			protectedYjs.POST("/storage/doc/:docId/snapshot", m.YjsHandler.SaveSnapshot)
			protectedYjs.GET("/storage/doc/:docId/snapshot", m.YjsHandler.GetSnapshot)
			protectedYjs.GET("/revision/:docId/reconstruct", m.YjsHandler.ReconstructDocument)
		}
	}
}
