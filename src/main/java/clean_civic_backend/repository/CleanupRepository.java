package clean_civic_backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import clean_civic_backend.entity.Cleanup;
import clean_civic_backend.entity.CleanupStatus;

public interface CleanupRepository extends JpaRepository<Cleanup, Long> {

    Optional<Cleanup> findByReportId(Long reportId);

    List<Cleanup> findByVolunteerId(Long volunteerId);

    List<Cleanup> findByStatus(CleanupStatus status);

    boolean existsByReportId(Long reportId);
}