from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from rest_framework_simplejwt.views import TokenRefreshView
from jobs.views import (
    AgencyViewSet,
    AttachmentViewSet,
    ExpenseViewSet,
    JobViewSet,
    LoginView,
    LogoutView,
    MeView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PaymentViewSet,
    RegisterView,
)

router = routers.DefaultRouter()
router.register('agencies', AgencyViewSet, basename='agency')
router.register('jobs', JobViewSet, basename='job')
router.register('payments', PaymentViewSet, basename='payment')
router.register('expenses', ExpenseViewSet, basename='expense')
router.register('attachments', AttachmentViewSet, basename='attachment')

auth_patterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('token/', LoginView.as_view(), name='token-obtain'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('password/change/', PasswordChangeView.as_view(), name='password-change'),
    path('password/reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password/reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include(auth_patterns)),
    path('api/', include(router.urls)),
]
