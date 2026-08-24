package clean_civic_backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import clean_civic_backend.dto.AfterImageRequest;
import clean_civic_backend.dto.CreateReportRequest;
import clean_civic_backend.dto.ReportResponse;
import clean_civic_backend.entity.ReportStatus;
import clean_civic_backend.service.ReportService;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportService reportService;

    public ReportController(
            ReportService reportService
    ) {
        this.reportService = reportService;
    }

    // ==========================================
    // CREATE REPORT
    // ==========================================

    @PostMapping
    public ResponseEntity<ReportResponse> createReport(
            @Valid @RequestBody CreateReportRequest request,
            Authentication authentication
    ) {

        Long userId = getUserId(authentication);

        ReportResponse response =
                reportService.createReport(
                        request,
                        userId
                );

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(response);
    }

    // ==========================================
    // ASSIGN VOLUNTEER
    // ADMIN ONLY
    // ==========================================

    @PatchMapping("/{id}/assign")
    public ResponseEntity<ReportResponse> assignVolunteer(
            @PathVariable Long id,
            @RequestParam Long volunteerId
    ) {

        ReportResponse response =
                reportService.assignVolunteer(
                        id,
                        volunteerId
                );

        return ResponseEntity.ok(response);
    }

    // ==========================================
    // START CLEANUP
    // VOLUNTEER ONLY
    // ==========================================

    @PatchMapping("/{id}/start")
    public ResponseEntity<ReportResponse> startCleanup(
            @PathVariable Long id,
            Authentication authentication
    ) {

        Long volunteerId =
                getUserId(authentication);

        ReportResponse response =
                reportService.startCleanup(
                        id,
                        volunteerId
                );

        return ResponseEntity.ok(response);
    }

    // ==========================================
    // SUBMIT AFTER IMAGE
    // ASSIGNED VOLUNTEER ONLY
    // ==========================================

    @PatchMapping("/{id}/after-image")
    public ResponseEntity<ReportResponse> submitAfterImage(
            @PathVariable Long id,
            @Valid @RequestBody AfterImageRequest request,
            Authentication authentication
    ) {

        Long volunteerId =
                getUserId(authentication);

        ReportResponse response =
                reportService.submitAfterImage(
                        id,
                        request,
                        volunteerId
                );

        return ResponseEntity.ok(response);
    }

    // ==========================================
    // VERIFY REPORT + AWARD POINTS
    // ADMIN ONLY
    // ==========================================

    @PatchMapping("/{id}/verify")
    public ResponseEntity<ReportResponse> verifyReport(
            @PathVariable Long id
    ) {

        ReportResponse response =
                reportService.verifyReport(id);

        return ResponseEntity.ok(response);
    }

    // ==========================================
    // GET ALL REPORTS
    // ==========================================

    @GetMapping
    public ResponseEntity<List<ReportResponse>> getAllReports() {

        return ResponseEntity.ok(
                reportService.getAllReports()
        );
    }

    // ==========================================
    // GET REPORT BY ID
    // ==========================================

    @GetMapping("/{id}")
    public ResponseEntity<ReportResponse> getReport(
            @PathVariable Long id
    ) {

        return ResponseEntity.ok(
                reportService.getReportById(id)
        );
    }

    // ==========================================
    // GET REPORTS BY STATUS
    // ==========================================

    @GetMapping("/status/{status}")
    public ResponseEntity<List<ReportResponse>>
    getReportsByStatus(
            @PathVariable ReportStatus status
    ) {

        return ResponseEntity.ok(
                reportService.getReportsByStatus(status)
        );
    }

    // ==========================================
    // GET MY REPORTS
    // ==========================================

    @GetMapping("/my")
    public ResponseEntity<List<ReportResponse>> getMyReports(
            Authentication authentication
    ) {

        Long userId =
                getUserId(authentication);

        return ResponseEntity.ok(
                reportService.getMyReports(userId)
        );
    }

    // ==========================================
    // GET USER ID FROM JWT
    // ==========================================

    private Long getUserId(
            Authentication authentication
    ) {

        if (!(authentication
                instanceof JwtAuthenticationToken jwtAuth)) {

            throw new RuntimeException(
                    "Invalid authentication"
            );
        }

        Object userIdClaim =
                jwtAuth.getToken()
                        .getClaims()
                        .get("userId");

        if (userIdClaim == null) {

            throw new RuntimeException(
                    "User ID not found in JWT"
            );
        }

        return Long.valueOf(
                userIdClaim.toString()
        );
    }
}