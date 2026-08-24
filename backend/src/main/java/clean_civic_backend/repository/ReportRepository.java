package clean_civic_backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import clean_civic_backend.entity.Report;
import clean_civic_backend.entity.ReportStatus;

public interface ReportRepository extends JpaRepository<Report, Long> {

    List<Report> findByStatus(ReportStatus status);

    List<Report> findByReporterId(Long reporterId);
}