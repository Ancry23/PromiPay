from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from jobs.views import AgencyViewSet, JobViewSet, MeView, PaymentViewSet, RegisterView

router = routers.DefaultRouter()
router.register('agencies', AgencyViewSet, basename='agency')
router.register('jobs', JobViewSet, basename='job')
router.register('payments', PaymentViewSet, basename='payment')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/register/', RegisterView.as_view(), name='auth-register'),
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token-obtain'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('api/auth/me/', MeView.as_view(), name='auth-me'),
    path('api/', include(router.urls)),
]
