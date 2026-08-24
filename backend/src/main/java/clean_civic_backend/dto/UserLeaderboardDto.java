package clean_civic_backend.dto;

public class UserLeaderboardDto {
    private Long id;
    private String name;
    private Integer points;
    private String role;

    public UserLeaderboardDto() {
    }

    public UserLeaderboardDto(Long id, String name, Integer points, String role) {
        this.id = id;
        this.name = name;
        this.points = points;
        this.role = role;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Integer getPoints() { return points; }
    public void setPoints(Integer points) { this.points = points; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
}
