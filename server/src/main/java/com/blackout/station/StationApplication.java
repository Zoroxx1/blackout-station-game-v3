package com.blackout.station;

import jakarta.persistence.*;
import java.util.List;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@SpringBootApplication
public class StationApplication {
    public static void main(String[] args) { SpringApplication.run(StationApplication.class, args); }
}

@Entity
class Run {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    public String name; public String outcome; public int crewSaved; public int timeLeft; public int powerLeft; public String seed;
}

interface RunRepository extends JpaRepository<Run, Long> {
    @Query("select r from Run r order by r.crewSaved desc, r.timeLeft desc")
    List<Run> top(PageRequest page);
}

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api")
class RunController {
    private final RunRepository repo;
    RunController(RunRepository repo) { this.repo = repo; }

    @PostMapping("/runs") Run create(@RequestBody Run r) { r.id = null; if (r.name != null && r.name.length() > 24) r.name = r.name.substring(0, 24); return repo.save(r); }
    @GetMapping("/leaderboard") List<Run> leaderboard() { return repo.top(PageRequest.of(0, 10)); }
    @GetMapping("/runs/{id}") ResponseEntity<Run> get(@PathVariable Long id) { return repo.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build()); }
}
