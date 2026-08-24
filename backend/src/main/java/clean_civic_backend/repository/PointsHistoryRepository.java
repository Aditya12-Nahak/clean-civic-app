package clean_civic_backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import clean_civic_backend.entity.PointsHistory;

public interface PointsHistoryRepository extends JpaRepository<PointsHistory, Long> {

    List<PointsHistory> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<PointsHistory> findByReportId(Long reportId);
}