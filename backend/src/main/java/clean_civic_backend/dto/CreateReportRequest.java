package clean_civic_backend.dto;

import clean_civic_backend.entity.Category;
import clean_civic_backend.entity.Severity;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class CreateReportRequest {

    @NotBlank(message = "Title is required")
    @Size(
        max = 150,
        message = "Title cannot exceed 150 characters"
    )
    private String title;

    @Size(
        max = 1000,
        message = "Description cannot exceed 1000 characters"
    )
    private String description;

    @NotNull(message = "Category is required")
    private Category category;

    @NotNull(message = "Severity is required")
    private Severity severity;

    @NotNull(message = "Latitude is required")
    private Double latitude;

    @NotNull(message = "Longitude is required")
    private Double longitude;

    @Size(
        max = 500,
        message = "Address cannot exceed 500 characters"
    )
    private String address;

    // BEFORE image is mandatory
    @NotBlank(message = "Before image is required")
    private String beforeImageUrl;

    public CreateReportRequest() {
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Category getCategory() {
        return category;
    }

    public void setCategory(Category category) {
        this.category = category;
    }

    public Severity getSeverity() {
        return severity;
    }

    public void setSeverity(Severity severity) {
        this.severity = severity;
    }

    public Double getLatitude() {
        return latitude;
    }

    public void setLatitude(Double latitude) {
        this.latitude = latitude;
    }

    public Double getLongitude() {
        return longitude;
    }

    public void setLongitude(Double longitude) {
        this.longitude = longitude;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getBeforeImageUrl() {
        return beforeImageUrl;
    }

    public void setBeforeImageUrl(String beforeImageUrl) {
        this.beforeImageUrl = beforeImageUrl;
    }
}