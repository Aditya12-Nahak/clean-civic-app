package clean_civic_backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

import clean_civic_backend.dto.UserLeaderboardDto;
import clean_civic_backend.repository.UserRepository;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<List<UserLeaderboardDto>> getLeaderboard() {
        List<UserLeaderboardDto> leaderboard = userRepository.findTop20ByOrderByPointsDesc().stream()
                .map(user -> new UserLeaderboardDto(
                        user.getId(),
                        user.getName(),
                        user.getPoints(),
                        user.getRole().name()
                ))
                .collect(Collectors.toList());

        return ResponseEntity.ok(leaderboard);
    }
}
