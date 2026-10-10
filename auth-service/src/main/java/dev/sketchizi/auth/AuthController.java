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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.stereotype.Controller;
import org.springframework.web.servlet.view.RedirectView;

@Controller
public class AuthController {
    private final CollaborationHostTokenService hostTokenService;

    public AuthController(CollaborationHostTokenService hostTokenService) { this.hostTokenService = hostTokenService; }

    static final String RETURN_TO_SESSION_KEY = "SKETCHIZI_AUTH_RETURN_TO";

    @GetMapping("/api/auth/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal OidcUser user) {
        if (user == null) return ResponseEntity.status(401).cacheControl(CacheControl.noStore()).body(Map.of("authenticated", false));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of(
            "authenticated", true,
            "user", Map.of("id", user.getSubject(), "email", safe(user.getEmail()), "name", safe(user.getFullName()), "picture", safe(user.getPicture()))
        ));
    }


    @PostMapping("/api/auth/collaboration-host-token")
    public ResponseEntity<?> collaborationHostToken(@AuthenticationPrincipal OidcUser user, @RequestBody Map<String, Object> body) {
        if (user == null) return ResponseEntity.status(401).cacheControl(CacheControl.noStore()).body(Map.of("error", "Sign in is required to host a collaboration."));
        Object roomValue = body.get("roomId");
        String roomId = roomValue instanceof String value ? value : "";
        if (!roomId.matches("[A-Za-z0-9_-]{20,64}")) return ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).body(Map.of("error", "Invalid collaboration room."));
        String name = safe(user.getFullName()).trim();
        if (name.isBlank()) name = safe(user.getEmail()).trim();
        if (name.isBlank()) return ResponseEntity.unprocessableEntity().cacheControl(CacheControl.noStore()).body(Map.of("error", "Your Google account does not provide a usable name or email address."));
        if (name.length() > 48) name = name.substring(0, 48).trim();
        try {
            String token = hostTokenService.issue(user.getSubject(), name, roomId);
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("token", token, "name", name));
        } catch (IllegalStateException exception) {
            return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(Map.of("error", "Secure collaboration hosting is temporarily unavailable."));
        }
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
