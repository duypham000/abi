package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

type PageResponse struct {
	Items      interface{} `json:"items"`
	TotalItems int64       `json:"total_items"`
	Page       int         `json:"page"`
	PageSize   int         `json:"page_size"`
	TotalPages int         `json:"total_pages"`
}

func Success(c *gin.Context, code int, message string, data interface{}) {
	c.JSON(code, APIResponse{
		Success: true,
		Message: message,
		Data:    data,
	})
}

func OK(c *gin.Context, message string, data interface{}) {
	Success(c, http.StatusOK, message, data)
}

func Created(c *gin.Context, message string, data interface{}) {
	Success(c, http.StatusCreated, message, data)
}

func Error(c *gin.Context, code int, message string, errDetail string) {
	c.JSON(code, APIResponse{
		Success: false,
		Message: message,
		Error:   errDetail,
	})
}

func BadRequest(c *gin.Context, message string, err error) {
	errDetail := ""
	if err != nil {
		errDetail = err.Error()
	}
	Error(c, http.StatusBadRequest, message, errDetail)
}

func Unauthorized(c *gin.Context, message string) {
	Error(c, http.StatusUnauthorized, message, "Unauthorized access")
}

func Forbidden(c *gin.Context, message string) {
	Error(c, http.StatusForbidden, message, "Forbidden resource")
}

func NotFound(c *gin.Context, message string) {
	Error(c, http.StatusNotFound, message, "Resource not found")
}

func InternalServerError(c *gin.Context, message string, err error) {
	errDetail := ""
	if err != nil {
		errDetail = err.Error()
	}
	Error(c, http.StatusInternalServerError, message, errDetail)
}
