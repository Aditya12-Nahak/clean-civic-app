package clean_civic_backend.dto;

import jakarta.validation.constraints.NotBlank;

public class AfterImageRequest {

    @NotBlank(message = "After image URL is required")
    private String afterImageUrl;

    public AfterImageRequest() {
    }

    public String getAfterImageUrl() {
        return afterImageUrl;
    }

    public void setAfterImageUrl(String afterImageUrl) {
        this.afterImageUrl = afterImageUrl;
    }
}