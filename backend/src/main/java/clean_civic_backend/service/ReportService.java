package clean_civic_backend.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import clean_civic_backend.dto.AfterImageRequest;
import clean_civic_backend.dto.CreateReportRequest;
import clean_civic_backend.dto.ReportResponse;
import clean_civic_backend.entity.Report;
import clean_civic_backend.entity.ReportStatus;
import clean_civic_backend.entity.Role;
import clean_civic_backend.entity.Severity;
import clean_civic_backend.entity.User;
import clean_civic_backend.repository.ReportRepository;
import clean_civic_backend.repository.UserRepository;

@Service
public class ReportService {

    private final ReportRepository reportRepository;
    private final UserRepository userRepository;

    public ReportService(
            ReportRepository reportRepository,
            UserRepository userRepository
    ) {
        this.reportRepository = reportRepository;
        this.userRepository = userRepository;
    }

    // ==========================================
    // CREATE REPORT
    // ==========================================

    @Transactional
    public ReportResponse createReport(
            CreateReportRequest request,
            Long userId
    ) {

        User reporter = userRepository.findById(userId)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        Report report = new Report();

        report.setReporter(reporter);

        report.setTitle(
                request.getTitle().trim()
        );

        report.setDescription(
                request.getDescription()
        );

        report.setCategory(
                request.getCategory()
        );

        report.setSeverity(
                request.getSeverity()
        );

        report.setLatitude(
                request.getLatitude()
        );

        report.setLongitude(
                request.getLongitude()
        );

        report.setAddress(
                request.getAddress()
        );

        // BEFORE image
        report.setBeforeImageUrl(
                request.getBeforeImageUrl()
        );

        // AFTER image is empty initially
        report.setAfterImageUrl(null);

        // No volunteer assigned initially
        report.setVolunteer(null);

        // New report
        report.setStatus(
                ReportStatus.PENDING
        );

        Report savedReport =
                reportRepository.save(report);

        return toResponse(savedReport);
    }

    // ==========================================
    // ASSIGN VOLUNTEER
    // ADMIN ONLY
    // ==========================================

    @Transactional
    public ReportResponse assignVolunteer(
            Long reportId,
            Long volunteerId
    ) {

        Report report = reportRepository.findById(reportId)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Report not found"
                        )
                );

        User volunteer = userRepository.findById(volunteerId)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Volunteer not found"
                        )
                );

        // Allow any user to volunteer (CITIZEN or VOLUNTEER)
        // Role check removed as per requirements so the same account can serve.

        // Only pending reports can be assigned
        if (report.getStatus() != ReportStatus.PENDING) {

            throw new RuntimeException(
                    "Only PENDING reports can be assigned"
            );
        }

        report.setVolunteer(volunteer);

        report.setStatus(
                ReportStatus.ASSIGNED
        );

        Report savedReport =
                reportRepository.save(report);

        return toResponse(savedReport);
    }

    // ==========================================
    // START CLEANUP
    // ASSIGNED VOLUNTEER ONLY
    // ==========================================

    @Transactional
    public ReportResponse startCleanup(
            Long reportId,
            Long volunteerId
    ) {

        Report report = reportRepository.findById(reportId)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Report not found"
                        )
                );

        // Check that a volunteer is assigned
        if (report.getVolunteer() == null) {

            throw new RuntimeException(
                    "No volunteer is assigned to this report"
            );
        }

        // Check that this is the assigned volunteer
        if (!report.getVolunteer()
                .getId()
                .equals(volunteerId)) {

            throw new RuntimeException(
                    "You are not the assigned volunteer"
            );
        }

        // Report must be assigned
        if (report.getStatus()
                != ReportStatus.ASSIGNED) {

            throw new RuntimeException(
                    "Report is not in ASSIGNED status"
            );
        }

        report.setStatus(
                ReportStatus.IN_PROGRESS
        );

        Report savedReport =
                reportRepository.save(report);

        return toResponse(savedReport);
    }

    // ==========================================
    // SUBMIT AFTER IMAGE
    // ASSIGNED VOLUNTEER ONLY
    // ==========================================

    @Transactional
    public ReportResponse submitAfterImage(
            Long reportId,
            AfterImageRequest request,
            Long volunteerId
    ) {

        Report report = reportRepository.findById(reportId)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Report not found"
                        )
                );

        // Check that a volunteer is assigned
        if (report.getVolunteer() == null) {

            throw new RuntimeException(
                    "No volunteer is assigned to this report"
            );
        }

        // Only assigned volunteer can submit
        if (!report.getVolunteer()
                .getId()
                .equals(volunteerId)) {

            throw new RuntimeException(
                    "You are not the assigned volunteer"
            );
        }

        // Cleanup must be in progress
        if (report.getStatus()
                != ReportStatus.IN_PROGRESS) {

            throw new RuntimeException(
                    "Cleanup is not currently in progress"
            );
        }

        // BEFORE image is required
        if (report.getBeforeImageUrl() == null
                || report.getBeforeImageUrl().isBlank()) {

            throw new RuntimeException(
                    "Before image is missing"
            );
        }

        report.setAfterImageUrl(
                request.getAfterImageUrl()
        );

        // Waiting for admin verification
        report.setStatus(
                ReportStatus.CLEANUP_SUBMITTED
        );

        Report savedReport =
                reportRepository.save(report);

        return toResponse(savedReport);
    }

    // ==========================================
    // VERIFY REPORT + AWARD POINTS
    // ADMIN ONLY
    // ==========================================

    @Transactional
    public ReportResponse verifyReport(
            Long reportId
    ) {

        Report report = reportRepository.findById(reportId)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Report not found"
                        )
                );

        // AFTER image is required
        if (report.getAfterImageUrl() == null
                || report.getAfterImageUrl().isBlank()) {

            throw new RuntimeException(
                    "After image is required before verification"
            );
        }

        // Must be submitted for verification
        if (report.getStatus()
                != ReportStatus.CLEANUP_SUBMITTED) {

            throw new RuntimeException(
                    "Report is not ready for verification"
            );
        }

        // Award points
        User reporter = report.getReporter();
        User volunteer = report.getVolunteer();

        int points = calculatePoints(
                report.getSeverity()
        );

        int currentReporterPoints =
                reporter.getPoints() == null
                        ? 0
                        : reporter.getPoints();

        reporter.setPoints(
                currentReporterPoints + points
        );
        userRepository.save(reporter);

        if (volunteer != null) {
            int currentVolunteerPoints =
                    volunteer.getPoints() == null
                            ? 0
                            : volunteer.getPoints();
            volunteer.setPoints(
                    currentVolunteerPoints + points
            );
            userRepository.save(volunteer);
        }

        // Mark verified
        report.setStatus(
                ReportStatus.VERIFIED
        );

        Report savedReport =
                reportRepository.save(report);

        return toResponse(savedReport);
    }

    // ==========================================
    // CALCULATE POINTS
    // ==========================================

    private int calculatePoints(
            Severity severity
    ) {

        return switch (severity) {

            case LOW -> 10;

            case MEDIUM -> 20;

            case HIGH -> 30;

            case CRITICAL -> 50;
        };
    }

    // ==========================================
    // GET ALL REPORTS
    // ==========================================

    @Transactional(readOnly = true)
    public List<ReportResponse> getAllReports() {

        return reportRepository.findAll()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    // ==========================================
    // GET REPORT BY ID
    // ==========================================

    @Transactional(readOnly = true)
    public ReportResponse getReportById(
            Long id
    ) {

        Report report = reportRepository.findById(id)
                .orElseThrow(() ->
                        new RuntimeException(
                                "Report not found"
                        )
                );

        return toResponse(report);
    }

    // ==========================================
    // GET REPORTS BY STATUS
    // ==========================================

    @Transactional(readOnly = true)
    public List<ReportResponse> getReportsByStatus(
            ReportStatus status
    ) {

        return reportRepository.findByStatus(status)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    // ==========================================
    // GET MY REPORTS
    // ==========================================

    @Transactional(readOnly = true)
    public List<ReportResponse> getMyReports(
            Long userId
    ) {

        return reportRepository
                .findByReporterId(userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    // ==========================================
    // ENTITY → RESPONSE
    // ==========================================

    private ReportResponse toResponse(
            Report report
    ) {

        ReportResponse response =
                new ReportResponse();

        response.setId(
                report.getId()
        );

        // Reporter
        if (report.getReporter() != null) {

            response.setReporterId(
                    report.getReporter().getId()
            );

            response.setReporterName(
                    report.getReporter().getName()
            );
        }

        // Existing report data
        response.setTitle(
                report.getTitle()
        );

        response.setDescription(
                report.getDescription()
        );

        response.setCategory(
                report.getCategory()
        );

        response.setSeverity(
                report.getSeverity()
        );

        response.setLatitude(
                report.getLatitude()
        );

        response.setLongitude(
                report.getLongitude()
        );

        response.setAddress(
                report.getAddress()
        );

        // Images
        response.setBeforeImageUrl(
                report.getBeforeImageUrl()
        );

        response.setAfterImageUrl(
                report.getAfterImageUrl()
        );

        // Status
        response.setStatus(
                report.getStatus()
        );

        response.setCreatedAt(
                report.getCreatedAt()
        );

        response.setUpdatedAt(
                report.getUpdatedAt()
        );

        return response;
    }
}