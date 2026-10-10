package dev.sketchizi.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.net.URI;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.stereotype.Controller;
import org.springframework.web.servlet.view.RedirectView;

@Controller
public class AuthController {
    static final String RETURN_TO_SESSION_KEY = "SKETCHIZI_AUTH_RETURN_TO";

    @GetMapping("/api/auth/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal OidcUser user) {
        if (user == null) return ResponseEntity.status(401).cacheControl(CacheControl.noStore()).body(Map.of("authenticated", false));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
            "authenticated", true,
            "user", Map.of("id", user.getSubject(), "email", safe(user.getEmail()), "name", safe(user.getFullName()), "picture", safe(user.getPicture()))
        ));
    }

    @GetMapping("/api/auth/csrf")
    public ResponseEntity<?> csrf(CsrfToken token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("token", token.getToken(), "headerName", token.getHeaderName()));
    }

    @GetMapping("/auth/login/google")
    public RedirectView beginGoogleLogin(HttpServletRequest request) {
        String returnTo = safeReturnTo(request.getParameter("returnTo"));
        request.getSession(true).setAttribute(RETURN_TO_SESSION_KEY, returnTo);
        return new RedirectView("/oauth2/authorization/google");
    }

    static String safeReturnTo(String candidate) {
        if (candidate == null || candidate.isBlank()) return "/";
        if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.contains("\\") || candidate.contains("\r") || candidate.contains("\n")) return "/";
        try {
            URI uri = URI.create(candidate);
            if (uri.isAbsolute() || uri.getHost() != null || uri.getUserInfo() != null) return "/";
            return uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery()) + (uri.getRawFragment() == null ? "" : "#" + uri.getRawFragment());
        } catch (IllegalArgumentException ex) { return "/"; }
    }

    private static String safe(String value) { return value == null ? "" : value; }
}
