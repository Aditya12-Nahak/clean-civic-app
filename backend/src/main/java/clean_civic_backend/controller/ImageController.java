package clean_civic_backend.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import clean_civic_backend.service.ImageUploadService;

@RestController
@RequestMapping("/api/images")
public class ImageController {

    private final ImageUploadService imageUploadService;

    public ImageController(ImageUploadService imageUploadService) {
        this.imageUploadService = imageUploadService;
    }

    @PostMapping("/upload")
    public ResponseEntity<Map<String, String>> uploadImage(
            @RequestParam("file") MultipartFile file
    ) throws Exception {

        String imageUrl = imageUploadService.uploadImage(file);

        return ResponseEntity.ok(
                Map.of("imageUrl", imageUrl)
        );
    }
}