package clean_civic_backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import clean_civic_backend.entity.Notification;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<Notification> findByUserIdAndReadFalseOrderByCreatedAtDesc(Long userId);
}